"""
APRetriever FastAPI Search Service - 完整版本
"""

import os
import json
import re
import urllib.parse
import openai
from typing import List, Tuple

# 加载环境变量
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from opensearchpy import OpenSearch

# 导入工具模块
import sys
sys.path.append('.')
from utils.embedding import BGEM3Embedder
from utils.rerank import BGEReranker
from utils.query_expansion import expand_query
from utils.settings import settings
from utils.models import SearchRequest, SearchResult, SearchResponse
from utils.s3_cache import S3Cache

# 禁用Python字节码缓存
os.environ['PYTHONDONTWRITEBYTECODE'] = '1'
os.environ['PYTHONUNBUFFERED'] = '1'

# 设置 OpenAI API 配置
openai.api_key = os.getenv("OPENAI_API_KEY", "")
openai.api_base = os.getenv("OPENAI_API_BASE", "http://127.0.0.1:8000/v1")

class AsyncPaperSearch:
    """Async论文搜索引擎类"""
    
    def __init__(self):
        """初始化搜索引擎"""
        self.opensearch_client = None
        self.embedder = None
        self.reranker = None
        self.cache = None
        
        # 初始化各个服务
        self._init_opensearch()
        self._init_embedder()
        self._init_reranker()
        self._init_cache()
    
    def _init_cache(self):
        """初始化S3+DynamoDB缓存"""
        try:
            if settings.USE_S3_CACHE:
                self.cache = S3Cache(
                    bucket_name=settings.S3_BUCKET_NAME,
                    table_name=settings.DYNAMODB_TABLE_NAME,
                    region_name=settings.DYNAMODB_REGION
                )
                print("✅ S3+DynamoDB缓存初始化成功")
            else:
                # 如果不使用S3缓存，可以回退到原来的DynamoDB缓存
                from utils.dynamodb_cache import DynamoDBCache
                self.cache = DynamoDBCache()
                print("✅ DynamoDB缓存初始化成功")
        except Exception as e:
            print(f"❌ 缓存初始化失败: {e}")
            self.cache = None
    
    def _init_opensearch(self):
        """初始化OpenSearch客户端"""
        if all([settings.OPENSEARCH_HOST, settings.OPENSEARCH_PORT, 
                settings.OPENSEARCH_USERNAME, settings.OPENSEARCH_PASSWORD]):
            try:
                self.opensearch_client = OpenSearch(
                    hosts=[{'host': settings.OPENSEARCH_HOST, 'port': settings.OPENSEARCH_PORT}],
                    http_auth=(settings.OPENSEARCH_USERNAME, settings.OPENSEARCH_PASSWORD),
                    use_ssl=True,
                    verify_certs=False,
                    ssl_show_warn=False
                )
                print("✅ OpenSearch客户端初始化成功")
            except Exception as e:
                print(f"❌ OpenSearch客户端初始化失败: {e}")
        else:
            print("⚠️  OpenSearch配置不完整，客户端未初始化")
    
    def _init_embedder(self):
        """初始化BGE-M3嵌入服务"""
        if settings.SAGEMAKER_ENDPOINT_NAME:
            try:
                self.embedder = BGEM3Embedder(settings.SAGEMAKER_ENDPOINT_NAME)
                print("✅ BGE-M3嵌入服务初始化成功")
            except Exception as e:
                print(f"❌ BGE-M3嵌入服务初始化失败: {e}")
        else:
            print("⚠️  未配置SAGEMAKER_ENDPOINT_NAME，嵌入服务不可用")
    
    def _init_reranker(self):
        """初始化BGE重排序服务"""
        if settings.ENABLE_RERANK and settings.SAGEMAKER_ENDPOINT_RERANK_NAME:
            try:
                self.reranker = BGEReranker(settings.SAGEMAKER_ENDPOINT_RERANK_NAME)
                print("✅ BGE重排序服务初始化成功")
            except Exception as e:
                print(f"❌ BGE重排序服务初始化失败: {e}")
        else:
            print("⚠️  重排序服务未启用或未配置")
    
    def extract_matched_keywords(self, highlight: dict) -> List[str]:
        """提取匹配的关键词"""
        matched = []
        for field, highlights in highlight.items():
            for highlight_text in highlights:
                matches = re.findall(r'<em>(.*?)</em>', highlight_text)
                matched.extend(matches)
        return list(set(matched))

    def evaluate_relevance(self, query: str, text: str, enable_llm: bool = False) -> Tuple[bool, str]:
        """
        使用LLM评估文本与查询的相关性
        
        Args:
            query: 查询词
            text: 待评估文本
            enable_llm: 是否启用LLM评估，默认为False
            
        Returns:
            tuple: (是否相关, 相关原因)
        """
        # 如果LLM相关性评估被禁用，直接返回True和默认原因
        if not enable_llm:
            return True, "未启用LLM评估"
            
        # 如果没有配置OpenAI API，直接返回True
        if not openai.api_key:
            return True, "未配置OpenAI API"
            
        try:
            prompt = f"""你是一个医学文献筛选助手。我会提供一个医学topic和下列医学文献的摘要。你的任务是判断这篇文献是否与该疾病相关，并按照以下规则输出结果：

如果摘要主要讨论该疾病，返回 true，并给出理由（不超过15字）。
如果摘要侧面提到该疾病（例如作为背景、对比或次要内容），返回 true，并给出理由（不超过15字）。
如果摘要与该疾病完全无关，返回 false，并给出理由（不超过15字）。

医学topic：{query}
文献摘要：{text}

始终以 JSON 格式输出，并包裹在 <json></json> 标签中。
JSON 结构如下：{{
  "is_relevant": IF_RELEVANT,
  "reason": REASON
}}"""
            
            # 使用OpenAI API进行评估
            client = openai.OpenAI(api_key=openai.api_key, base_url=openai.api_base)
            response = client.chat.completions.create(
                model="Qwen2.5-72B-Instruct-AWQ",
                messages=[
                    {"role": "system", "content": "你是一个专业的医学文献相关性评估专家。请严格按照用户的要求格式输出结果。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.01,
                max_tokens=100
            )
            
            result = response.choices[0].message.content.strip()
            try:
                # 使用正则表达式匹配JSON内容
                json_patterns = [
                    r'<json>(.*?)</json>',  # 匹配<json>标签中的内容
                    r'```json\s*(.*?)\s*```'  # 匹配```json ```中的内容
                ]
                
                json_str = None
                for pattern in json_patterns:
                    matches = re.findall(pattern, result, re.DOTALL)
                    if matches:
                        json_str = matches[0].strip()
                        break
                
                if not json_str:
                    print(f"未找到JSON内容: {result}")
                    return True, "JSON内容解析失败"
                
                json_result = json.loads(json_str)
                return json_result.get('is_relevant', True), json_result.get('reason', '解析评估原因失败')
            except json.JSONDecodeError:
                print(f"JSON解析失败: {result}")
                return True, "JSON解析失败"
        except Exception as e:
            print(f"相关性评估出错: {str(e)}")
            return True, f"评估出错: {str(e)}"  # 出错时默认保留该结果

    def build_hybrid_search_query(self, query_terms: List[str], query_embedding: List[float], page: int, page_size: int) -> dict:
        """构建混合搜索查询"""
        from_value = (page - 1) * page_size
        
        # 构建多个查询词的bool查询，类似关键词搜索
        should_queries = []
        for keyword in query_terms:
            should_queries.extend([
                {
                    "match_phrase": {
                        "title": {
                            "query": keyword,
                            "boost": 5  # 标题权重
                        }
                    }
                },
                {
                    "match_phrase": {
                        "keywords": {
                            "query": keyword,
                            "boost": 10  # 关键词权重
                        }
                    }
                },
                {
                    "match_phrase": {
                        "abstract": {
                            "query": keyword,
                            "boost": 2  # 摘要权重
                        }
                    }
                }
            ])
        
        return {
            "from": from_value,
            "size": page_size,
            "query": {
                "hybrid": {
                    "queries": [
                        {
                            "bool": {
                                "should": should_queries,
                                "minimum_should_match": 1  # 至少匹配一个关键词
                            }
                        },
                        {
                            "knn": {
                                "embedding": {
                                    "vector": query_embedding,
                                    "k": page_size
                                }
                            }
                        }
                    ]
                }
            },
            "_source": ["id", "title", "abstract", "keywords"],
            "highlight": {
                "fields": {
                    "title": {},
                    "abstract": {},
                    "keywords": {}
                }
            }
        }

    def build_vector_search_query(self, query_embedding: List[float], query_terms: List[str], page: int, page_size: int) -> dict:
        """构建向量搜索查询"""
        from_value = (page - 1) * page_size
        
        # 构建must_not查询
        must_not_queries = []
        for keyword in query_terms:
            must_not_queries.extend([
                {"match_phrase": {"title": keyword}},
                {"match_phrase": {"keywords": keyword}},
                {"match_phrase": {"abstract": keyword}}
            ])

        return {
            "from": from_value,
            "size": page_size,
            "query": {
                "bool": {
                    "must": {
                        "knn": {
                            "embedding": {
                                "vector": query_embedding,
                                "k": page_size
                            }
                        }
                    },
                    "must_not": must_not_queries
                }
            },
            "_source": ["id", "title", "abstract", "keywords"]
        }

    def build_keyword_search_query(self, query_terms: List[str], page: int, page_size: int) -> dict:
        """构建关键词搜索查询"""
        from_value = (page - 1) * page_size
        
        # 构建bool查询
        should_queries = []
        for keyword in query_terms:
            should_queries.extend([
                {
                    "match_phrase": {
                        "title": {
                            "query": keyword,
                            "boost": 5  # 标题权重
                        }
                    }
                },
                {
                    "match_phrase": {
                        "keywords": {
                            "query": keyword,
                            "boost": 10  # 关键词权重
                        }
                    }
                },
                {
                    "match_phrase": {
                        "abstract": {
                            "query": keyword,
                            "boost": 2  # 摘要权重
                        }
                    }
                }
            ])
        
        return {
            "from": from_value,
            "size": page_size,
            "query": {
                "bool": {
                    "should": should_queries,
                    "minimum_should_match": 1  # 至少匹配一个关键词
                }
            },
            "_source": ["id", "title", "abstract", "keywords"],
            "highlight": {
                "fields": {
                    "title": {},
                    "abstract": {},
                    "keywords": {}
                }
            }
        }

    def find_matched_keywords(self, keywords: List[str], hit_source: dict) -> List[str]:
        """找出匹配的关键词"""
        matched_keywords = []
        for keyword in keywords:
            # 检查标题、关键词和摘要中是否包含该关键词
            if (keyword.lower() in hit_source['title'].lower() or
                keyword.lower() in ' '.join(hit_source.get('keywords', [])).lower() or
                keyword.lower() in hit_source['abstract'].lower()):
                matched_keywords.append(keyword)
        return matched_keywords

    async def search(self, request: SearchRequest) -> SearchResponse:
        """执行搜索"""
        try:
            # 检查OpenSearch是否可用
            if not self.opensearch_client:
                raise Exception("OpenSearch服务不可用，请检查配置")
            
            # 解决URL编码问题
            try:
                query = urllib.parse.unquote(request.query)
                print(f"解码后的查询: {query}")
                print(f"LLM相关性评估: {'启用' if request.enableLlm else '禁用'}")
            except Exception as e:
                print(f"URL解码出错: {str(e)}")
                query = request.query
            
            if not query:
                return SearchResponse(
                    total=0,
                    results=[],
                    searchType=request.searchType,
                    rewrittenTerms=None
                )
            
            print(f"搜索类型: {request.searchType}, 查询: {query}")
            
            # 查询扩展
            query_terms = expand_query(query)
            print(f"扩展后的搜索词: {query_terms}")
            
            if request.searchType == 'hybrid':
                return await self._hybrid_search(query, query_terms, request)
            elif request.searchType == 'vector':
                return await self._vector_search(query, query_terms, request)
            else:
                return await self._keyword_search(query, query_terms, request)
            
        except Exception as e:
            print(f"搜索错误: {str(e)}")
            return SearchResponse(
                total=0,
                results=[],
                searchType=request.searchType,
                rewrittenTerms=None
            )

    async def _hybrid_search(self, query: str, query_terms: List[str], request: SearchRequest) -> SearchResponse:
        """混合搜索"""
        if not self.embedder:
            raise Exception("嵌入服务不可用，无法执行混合搜索")
            
        query_embedding = self.embedder.get_embeddings(query)[0].tolist()
        search_query = self.build_hybrid_search_query(query_terms, query_embedding, request.page, request.pageSize)
        
        # 使用search pipeline进行归一化和权重组合
        search_params = {"search_pipeline": "nlp-search-pipeline"}
        
        # 执行搜索
        response = self.opensearch_client.search(
            index=settings.OPENSEARCH_INDEX_NAME,
            body=search_query,
            params=search_params
        )
        
        # 处理搜索结果
        results = []
        for hit in response['hits']['hits']:
            # 找出匹配的关键词
            matched_keywords = self.find_matched_keywords(query_terms, hit['_source'])
            
            # 提取高亮匹配的关键词
            highlight_matched = self.extract_matched_keywords(hit.get('highlight', {}))
            
            result = SearchResult(
                id=hit['_source']['id'],
                title=hit['_source']['title'],
                keywords=hit['_source'].get('keywords', []),
                abstract=hit['_source']['abstract'],
                score=hit['_score'],
                source='hybrid',
                matched_keywords=matched_keywords + highlight_matched
            )
            results.append(result)
        
        # 如果启用了rerank功能，对所有结果进行重排序
        if settings.ENABLE_RERANK and self.reranker and results:
            results = await self._rerank_results(query, results)
        
        # 创建搜索响应
        search_response = SearchResponse(
            total=response['hits']['total']['value'],
            results=results,
            searchType=request.searchType,
            rewrittenTerms=query_terms
        )
        
        # 保存搜索结果到DynamoDB缓存
        if self.cache:
            search_id = self.cache.save_search_result(
                query=query,
                search_type=request.searchType,
                response=search_response,
                enable_llm=request.enableLlm
            )
            if search_id:
                search_response.search_id = search_id
        
        return search_response

    async def _vector_search(self, query: str, query_terms: List[str], request: SearchRequest) -> SearchResponse:
        """向量搜索"""
        if not self.embedder:
            raise Exception("嵌入服务不可用，无法执行向量搜索")
            
        query_embedding = self.embedder.get_embeddings(query)[0].tolist()
        search_query = self.build_vector_search_query(query_embedding, query_terms, request.page, request.pageSize)
        
        # 执行搜索
        response = self.opensearch_client.search(
            index=settings.OPENSEARCH_INDEX_NAME,
            body=search_query
        )
        
        # 处理搜索结果
        results = []
        for hit in response['hits']['hits']:
            # 构建评估文本
            eval_text = f"标题：{hit['_source']['title']}\n摘要：{hit['_source']['abstract']}"
            
            # 进行相关性评估
            is_relevant, reason = self.evaluate_relevance(query, eval_text, request.enableLlm)
            if is_relevant:
                result = SearchResult(
                    id=hit['_source']['id'],
                    title=hit['_source']['title'],
                    keywords=hit['_source'].get('keywords', []),
                    abstract=hit['_source']['abstract'],
                    score=hit['_score'],
                    source='vector',
                    relevance_reason=reason
                )
                results.append(result)
            else:
                print(f"文档 {hit['_source']['id']} 被LLM评估为不相关，原因：{reason}")
        
        # 创建搜索响应
        search_response = SearchResponse(
            total=len(results),
            results=results,
            searchType=request.searchType,
            rewrittenTerms=query_terms
        )
        
        # 保存搜索结果到DynamoDB缓存
        if self.cache:
            search_id = self.cache.save_search_result(
                query=query,
                search_type=request.searchType,
                response=search_response,
                enable_llm=request.enableLlm
            )
            if search_id:
                search_response.search_id = search_id
        
        return search_response

    async def _keyword_search(self, query: str, query_terms: List[str], request: SearchRequest) -> SearchResponse:
        """关键词搜索"""
        search_query = self.build_keyword_search_query(query_terms, request.page, request.pageSize)
        
        # 执行搜索
        response = self.opensearch_client.search(
            index=settings.OPENSEARCH_INDEX_NAME,
            body=search_query
        )
        
        # 处理搜索结果
        results = []
        seen_ids = set()  # 用于记录已经召回的文档ID
        
        for hit in response['hits']['hits']:
            # 找出匹配的关键词
            matched_keywords = self.find_matched_keywords(query_terms, hit['_source'])
            
            # 提取高亮匹配的关键词
            highlight_matched = self.extract_matched_keywords(hit.get('highlight', {}))
            
            result = SearchResult(
                id=hit['_source']['id'],
                title=hit['_source']['title'],
                keywords=hit['_source'].get('keywords', []),
                abstract=hit['_source']['abstract'],
                score=hit['_score'],
                source='keyword',
                matched_keywords=matched_keywords + highlight_matched
            )
            results.append(result)
            seen_ids.add(hit['_source']['id'])
        
        # 如果关键词搜索结果不足10000且有嵌入服务，使用向量检索补充
        if len(results) < 10000 and self.embedder:
            results = await self._supplement_with_vector_search(query, query_terms, results, seen_ids, request)
        
        # 如果启用了rerank功能，对所有结果进行重排序
        if settings.ENABLE_RERANK and self.reranker and results:
            results = await self._rerank_results(query, results)
        
        # 创建搜索响应
        search_response = SearchResponse(
            total=len(results),
            results=results,
            searchType=request.searchType,
            rewrittenTerms=query_terms
        )
        
        # 保存搜索结果到DynamoDB缓存
        if self.cache:
            search_id = self.cache.save_search_result(
                query=query,
                search_type=request.searchType,
                response=search_response,
                enable_llm=request.enableLlm
            )
            if search_id:
                search_response.search_id = search_id
        
        return search_response

    async def _supplement_with_vector_search(self, query: str, query_terms: List[str], 
                                           results: List[SearchResult], seen_ids: set, 
                                           request: SearchRequest) -> List[SearchResult]:
        """使用向量搜索补充关键词搜索结果"""
        print(f"关键词搜索结果数量不足10000（当前：{len(results)}），使用向量检索补充")
        remaining_size = 10000 - len(results)
        
        # 将原始查询和扩写关键词合并成一个查询
        combined_query = " ".join([query] + query_terms)
        print(f"合并后的查询词: {combined_query}")
        
        # 获取合并查询的向量表示
        query_embedding = self.embedder.get_embeddings(combined_query)[0].tolist()
        
        # 构建must_not查询，排除已有结果和包含关键词的文档
        must_not_queries = [{"terms": {"id": list(seen_ids)}}]  # 排除已有结果
        
        # 添加关键词匹配排除
        for keyword in query_terms:
            must_not_queries.extend([
                {"match_phrase": {"title": keyword}},
                {"match_phrase": {"keywords": keyword}},
                {"match_phrase": {"abstract": keyword}}
            ])
        
        # 构建向量检索查询
        vector_search_query = {
            "size": remaining_size,
            "query": {
                "bool": {
                    "must": {
                        "knn": {
                            "embedding": {
                                "vector": query_embedding,
                                "k": remaining_size
                            }
                        }
                    },
                    "must_not": must_not_queries
                }
            },
            "_source": ["id", "title", "abstract", "keywords"]
        }
        
        # 执行向量检索
        vector_response = self.opensearch_client.search(
            index=settings.OPENSEARCH_INDEX_NAME,
            body=vector_search_query
        )
        
        # 处理向量检索结果
        vector_results = []
        for hit in vector_response['hits']['hits']:
            if hit['_source']['id'] not in seen_ids and hit['_score'] >= 0.1:  # 只添加分数大于0.1的结果
                # 构建评估文本
                eval_text = f"标题：{hit['_source']['title']}\n摘要：{hit['_source']['abstract']}"
                
                # 进行相关性评估
                is_relevant, reason = self.evaluate_relevance(query, eval_text, request.enableLlm)
                if is_relevant:
                    result = SearchResult(
                        id=hit['_source']['id'],
                        title=hit['_source']['title'],
                        keywords=hit['_source'].get('keywords', []),
                        abstract=hit['_source']['abstract'],
                        score=hit['_score'],
                        source='vector',
                        relevance_reason=reason
                    )
                    vector_results.append(result)
                else:
                    print(f"文档 {hit['_source']['id']} 被LLM评估为不相关，原因：{reason}")
        
        # 添加向量检索结果到最终结果中
        results.extend(vector_results)
        
        print(f"向量检索结果数: {len(vector_results)}")
        print(f"补充后的结果总数：{len(results)}")
        
        # 对所有结果按分数重新排序
        results.sort(key=lambda x: x.score, reverse=True)
        print(f"排序后的前3个结果得分: {[result.score for result in results[:3]]}")
        
        return results

    async def _rerank_results(self, query: str, results: List[SearchResult]) -> List[SearchResult]:
        """对搜索结果进行重排序"""
        try:
            # 提取所有文档的标题
            titles = [result.title for result in results]
            
            # 使用原始查询和标题进行rerank
            rerank_results = self.reranker.rerank(query, titles)
            
            # 更新结果的得分
            if rerank_results:
                for i, rerank_result in enumerate(rerank_results):
                    if i < len(results):
                        results[i].score = rerank_result['score']
                
                # 根据新的得分重新排序
                results.sort(key=lambda x: x.score, reverse=True)
                print(f"Rerank完成，重新排序后的前3个结果得分: {[result.score for result in results[:3]]}")
        except Exception as e:
            print(f"Rerank过程出错: {str(e)}")
        
        return results

    def get_service_status(self) -> dict:
        """获取服务状态"""
        cache_type = "none"
        if self.cache:
            if hasattr(self.cache, 's3_client'):
                cache_type = "s3+dynamodb"
            else:
                cache_type = "dynamodb"
        
        return {
            "opensearch": self.opensearch_client is not None,
            "embedder": self.embedder is not None,
            "reranker": self.reranker is not None,
            "cache": self.cache is not None,
            "cache_type": cache_type
        }

# ================================
# 全局搜索引擎实例
# ================================

search_engine = AsyncPaperSearch()

# ================================
# FastAPI应用
# ================================

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="医学文献搜索API服务 - 完整版本",
    version=settings.VERSION,
    openapi_url="/openapi.json" if settings.ENVIRONMENT != "production" else None
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_HOSTS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ================================
# API端点
# ================================

@app.get("/")
async def root():
    """根端点"""
    return {
        "message": "Async FastAPI Search Service",
        "version": settings.VERSION,
        "docs_url": "/docs",
        "health_url": "/health"
    }

@app.get("/health")
async def health_check():
    """健康检查端点"""
    status = {
        "status": "healthy",
        "service": "async-fastapi-search",
        "version": settings.VERSION,
        "services": search_engine.get_service_status()
    }
    return status

@app.post("/search", response_model=SearchResponse)
async def search_post(request: SearchRequest):
    """POST方式搜索"""
    return await search_engine.search(request)

@app.get("/cache/{search_id}")
async def get_cached_search(search_id: str):
    """根据搜索ID获取缓存的搜索结果"""
    if not search_engine.cache:
        return {"error": "缓存未初始化"}
    
    result = search_engine.cache.get_search_result(search_id)
    if result:
        return result
    else:
        return {"error": f"未找到搜索ID: {search_id}"}

@app.get("/cache/{search_id}/metadata")
async def get_cached_search_metadata(search_id: str):
    """根据搜索ID获取缓存的搜索元数据（不包含完整结果）"""
    if not search_engine.cache:
        return {"error": "缓存未初始化"}
    
    # 检查是否有get_search_metadata方法（S3Cache有，DynamoDBCache没有）
    if hasattr(search_engine.cache, 'get_search_metadata'):
        result = search_engine.cache.get_search_metadata(search_id)
    else:
        result = search_engine.cache.get_search_result(search_id)
    
    if result:
        return result
    else:
        return {"error": f"未找到搜索ID: {search_id}"}

@app.get("/cache/stats")
async def get_cache_stats():
    """获取缓存统计信息"""
    if not search_engine.cache:
        return {"error": "缓存未初始化"}
    
    return search_engine.cache.get_cache_stats()

@app.delete("/cache/{search_id}")
async def delete_cached_search(search_id: str):
    """删除缓存的搜索结果"""
    if not search_engine.cache:
        return {"error": "缓存未初始化"}
    
    success = search_engine.cache.delete_search_result(search_id)
    if success:
        return {"message": f"搜索结果已删除: {search_id}"}
    else:
        return {"error": f"删除失败: {search_id}"}

if __name__ == "__main__":
    import uvicorn
    print("🚀 启动 Async FastAPI Search Service...")
    print("📖 API文档: http://localhost:8000/docs")
    print("🔍 搜索API: http://localhost:8000/search")
    print("❤️  健康检查: http://localhost:8000/health")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True) 