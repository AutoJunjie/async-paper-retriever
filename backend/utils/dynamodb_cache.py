"""
DynamoDB缓存模块 - 用于保存搜索结果到DynamoDB
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError
from .models import SearchResponse, SearchResult


class DynamoDBCache:
    """DynamoDB缓存管理器"""
    
    def __init__(self, table_name: str = "asyncSearchCache", region_name: str = "us-west-2"):
        """
        初始化DynamoDB缓存
        
        Args:
            table_name: DynamoDB表名
            region_name: AWS区域
        """
        self.table_name = table_name
        self.region_name = region_name
        
        # 初始化DynamoDB客户端
        try:
            self.dynamodb = boto3.resource('dynamodb', region_name=region_name)
            self.table = self.dynamodb.Table(table_name)
            print(f"✅ DynamoDB缓存初始化成功 - 表: {table_name}, 区域: {region_name}")
        except Exception as e:
            print(f"❌ DynamoDB缓存初始化失败: {e}")
            self.dynamodb = None
            self.table = None
    
    def generate_search_id(self) -> str:
        """生成唯一的搜索ID"""
        return str(uuid.uuid4())
    
    def _serialize_search_results(self, results: List[SearchResult]) -> List[Dict]:
        """序列化搜索结果为DynamoDB兼容格式"""
        serialized_results = []
        for result in results:
            # 将SearchResult对象转换为字典，使用Decimal类型处理数值
            result_dict = {
                "id": result.id,
                "title": result.title,
                "keywords": result.keywords or [],
                "abstract": result.abstract,
                "score": Decimal(str(result.score)) if result.score is not None else Decimal('0'),
                "source": result.source or "",
                "matched_keywords": result.matched_keywords or [],
                "relevance_reason": result.relevance_reason or ""
            }
            serialized_results.append(result_dict)
        return serialized_results
    
    def save_search_result(self, 
                          query: str, 
                          search_type: str, 
                          response: SearchResponse,
                          enable_llm: bool = False,
                          user_id: Optional[str] = None) -> Optional[str]:
        """
        保存搜索结果到DynamoDB
        
        Args:
            query: 搜索查询词
            search_type: 搜索类型
            response: 搜索响应对象
            enable_llm: 是否启用LLM评估
            user_id: 用户ID（可选）
            
        Returns:
            搜索ID，如果保存失败返回None
        """
        if not self.table:
            print("❌ DynamoDB表未初始化，无法保存搜索结果")
            return None
        
        try:
            # 生成唯一搜索ID
            search_id = self.generate_search_id()
            
            # 准备要保存的数据
            item = {
                'uuid': search_id,  # 使用uuid作为主键
                'search_id': search_id,  # 保留search_id字段用于兼容性
                'query': query,
                'search_type': search_type,
                'enable_llm': enable_llm,
                'total_results': response.total,
                'results': self._serialize_search_results(response.results),
                'rewritten_terms': response.rewrittenTerms or [],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'created_at': int(datetime.now(timezone.utc).timestamp()),
                'ttl': int(datetime.now(timezone.utc).timestamp()) + (30 * 24 * 60 * 60)  # 30天TTL
            }
            
            # 添加用户ID（如果提供）
            if user_id:
                item['user_id'] = user_id
            
            # 保存到DynamoDB
            self.table.put_item(Item=item)
            
            print(f"✅ 搜索结果已保存到DynamoDB - ID: {search_id}")
            print(f"   查询: {query}")
            print(f"   搜索类型: {search_type}")
            print(f"   结果数量: {response.total}")
            print(f"   LLM评估: {'启用' if enable_llm else '禁用'}")
            
            return search_id
            
        except ClientError as e:
            print(f"❌ DynamoDB保存失败 - ClientError: {e}")
            return None
        except Exception as e:
            print(f"❌ DynamoDB保存失败 - Exception: {e}")
            return None
    
    def get_search_result(self, search_id: str) -> Optional[Dict[str, Any]]:
        """
        根据搜索ID获取搜索结果
        
        Args:
            search_id: 搜索ID
            
        Returns:
            搜索结果字典，如果未找到返回None
        """
        if not self.table:
            print("❌ DynamoDB表未初始化，无法获取搜索结果")
            return None
        
        try:
            response = self.table.get_item(Key={'uuid': search_id})
            
            if 'Item' in response:
                return response['Item']
            else:
                print(f"❌ 未找到搜索ID: {search_id}")
                return None
                
        except ClientError as e:
            print(f"❌ DynamoDB查询失败 - ClientError: {e}")
            return None
        except Exception as e:
            print(f"❌ DynamoDB查询失败 - Exception: {e}")
            return None
    
    def get_user_search_history(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """
        获取用户的搜索历史
        
        Args:
            user_id: 用户ID
            limit: 返回结果数量限制
            
        Returns:
            搜索历史列表
        """
        if not self.table:
            print("❌ DynamoDB表未初始化，无法获取搜索历史")
            return []
        
        try:
            # 使用GSI查询用户搜索历史（需要在DynamoDB中创建GSI）
            response = self.table.query(
                IndexName='user_id-timestamp-index',  # 需要创建这个GSI
                KeyConditionExpression='user_id = :user_id',
                ExpressionAttributeValues={':user_id': user_id},
                ScanIndexForward=False,  # 按时间戳降序排列
                Limit=limit
            )
            
            return response.get('Items', [])
            
        except ClientError as e:
            print(f"❌ 查询用户搜索历史失败 - ClientError: {e}")
            return []
        except Exception as e:
            print(f"❌ 查询用户搜索历史失败 - Exception: {e}")
            return []
    
    def delete_search_result(self, search_id: str) -> bool:
        """
        删除搜索结果
        
        Args:
            search_id: 搜索ID
            
        Returns:
            删除是否成功
        """
        if not self.table:
            print("❌ DynamoDB表未初始化，无法删除搜索结果")
            return False
        
        try:
            self.table.delete_item(Key={'uuid': search_id})
            print(f"✅ 搜索结果已删除 - ID: {search_id}")
            return True
            
        except ClientError as e:
            print(f"❌ DynamoDB删除失败 - ClientError: {e}")
            return False
        except Exception as e:
            print(f"❌ DynamoDB删除失败 - Exception: {e}")
            return False
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        获取缓存统计信息
        
        Returns:
            缓存统计信息字典
        """
        if not self.table:
            return {"error": "DynamoDB表未初始化"}
        
        try:
            # 获取表的基本信息
            table_info = self.table.meta.client.describe_table(TableName=self.table_name)
            
            stats = {
                "table_name": self.table_name,
                "table_status": table_info['Table']['TableStatus'],
                "item_count": table_info['Table']['ItemCount'],
                "table_size_bytes": table_info['Table']['TableSizeBytes'],
                "region": self.region_name
            }
            
            return stats
            
        except ClientError as e:
            return {"error": f"获取统计信息失败: {e}"}
        except Exception as e:
            return {"error": f"获取统计信息失败: {e}"} 