"""
S3+DynamoDB缓存模块 - 将搜索结果存储到S3，在DynamoDB中存储S3路径
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError
from .models import SearchResponse, SearchResult


class S3Cache:
    """S3+DynamoDB缓存管理器"""
    
    def __init__(self, 
                 bucket_name: str = "async-papaer-search-results", 
                 table_name: str = "asyncSearchCache", 
                 region_name: str = "us-west-2"):
        """
        初始化S3+DynamoDB缓存
        
        Args:
            bucket_name: S3存储桶名称
            table_name: DynamoDB表名
            region_name: AWS区域
        """
        self.bucket_name = bucket_name
        self.table_name = table_name
        self.region_name = region_name
        
        # 初始化S3客户端
        try:
            self.s3_client = boto3.client('s3', region_name=region_name)
            print(f"✅ S3客户端初始化成功 - 存储桶: {bucket_name}, 区域: {region_name}")
        except Exception as e:
            print(f"❌ S3客户端初始化失败: {e}")
            self.s3_client = None
        
        # 初始化DynamoDB客户端
        try:
            self.dynamodb = boto3.resource('dynamodb', region_name=region_name)
            self.table = self.dynamodb.Table(table_name)
            
            # 自动检测表的主键结构
            self.primary_key = self._detect_primary_key()
            print(f"✅ DynamoDB缓存初始化成功 - 表: {table_name}, 区域: {region_name}, 主键: {self.primary_key}")
        except Exception as e:
            print(f"❌ DynamoDB缓存初始化失败: {e}")
            self.dynamodb = None
            self.table = None
            self.primary_key = 'cache_key'  # 默认主键
    
    def _detect_primary_key(self) -> str:
        """自动检测DynamoDB表的主键"""
        try:
            print(f"🔍 正在检测表 {self.table_name} 的主键...")
            table_info = self.table.meta.client.describe_table(TableName=self.table_name)
            key_schema = table_info['Table']['KeySchema']
            
            print(f"   表状态: {table_info['Table']['TableStatus']}")
            print(f"   主键结构: {key_schema}")
            
            # 查找主键名称
            for key in key_schema:
                if key['KeyType'] == 'HASH':
                    primary_key = key['AttributeName']
                    print(f"✅ 检测到主键: {primary_key}")
                    return primary_key
            
            # 如果没有找到，使用默认值
            print("⚠️  未找到HASH主键，使用默认值: cache_key")
            return 'cache_key'
            
        except Exception as e:
            print(f"❌ 主键检测失败: {e}")
            print(f"   使用默认值: cache_key")
            return 'cache_key'
    
    def generate_search_id(self) -> str:
        """生成唯一的搜索ID"""
        return str(uuid.uuid4())
    
    def _serialize_search_results(self, results: List[SearchResult]) -> List[Dict]:
        """序列化搜索结果为JSON兼容格式"""
        serialized_results = []
        for result in results:
            # 将SearchResult对象转换为字典
            result_dict = {
                "id": result.id,
                "title": result.title,
                "keywords": result.keywords or [],
                "abstract": result.abstract,
                "score": float(result.score) if result.score is not None else 0.0,
                "source": result.source or "",
                "matched_keywords": result.matched_keywords or [],
                "relevance_reason": result.relevance_reason or ""
            }
            serialized_results.append(result_dict)
        return serialized_results
    
    def _upload_to_s3(self, search_id: str, data: Dict[str, Any]) -> Optional[str]:
        """
        将数据上传到S3
        
        Args:
            search_id: 搜索ID
            data: 要上传的数据
            
        Returns:
            S3对象键，如果上传失败返回None
        """
        if not self.s3_client:
            print("❌ S3客户端未初始化，无法上传数据")
            return None
        
        try:
            # 生成S3对象键
            s3_key = f"search-results/{datetime.now().strftime('%Y/%m/%d')}/{search_id}.json"
            
            # 将数据转换为JSON字符串
            json_data = json.dumps(data, ensure_ascii=False, indent=2)
            
            # 上传到S3
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=json_data.encode('utf-8'),
                ContentType='application/json',
                ServerSideEncryption='AES256'
            )
            
            print(f"✅ 搜索结果已上传到S3 - 键: {s3_key}")
            return s3_key
            
        except ClientError as e:
            print(f"❌ S3上传失败 - ClientError: {e}")
            return None
        except Exception as e:
            print(f"❌ S3上传失败 - Exception: {e}")
            return None
    
    def _download_from_s3(self, s3_key: str) -> Optional[Dict[str, Any]]:
        """
        从S3下载数据
        
        Args:
            s3_key: S3对象键
            
        Returns:
            下载的数据，如果下载失败返回None
        """
        if not self.s3_client:
            print("❌ S3客户端未初始化，无法下载数据")
            return None
        
        try:
            # 从S3下载对象
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            
            # 读取并解析JSON数据
            json_data = response['Body'].read().decode('utf-8')
            data = json.loads(json_data)
            
            return data
            
        except ClientError as e:
            print(f"❌ S3下载失败 - ClientError: {e}")
            return None
        except Exception as e:
            print(f"❌ S3下载失败 - Exception: {e}")
            return None
    
    def save_search_result(self, 
                          query: str, 
                          search_type: str, 
                          response: SearchResponse,
                          enable_llm: bool = False,
                          user_id: Optional[str] = None) -> Optional[str]:
        """
        保存搜索结果到S3+DynamoDB
        
        Args:
            query: 搜索查询词
            search_type: 搜索类型
            response: 搜索响应对象
            enable_llm: 是否启用LLM评估
            user_id: 用户ID（可选）
            
        Returns:
            搜索ID，如果保存失败返回None
        """
        if not self.table or not self.s3_client:
            print("❌ S3或DynamoDB未初始化，无法保存搜索结果")
            return None
        
        try:
            # 生成唯一搜索ID
            search_id = self.generate_search_id()
            
            # 准备要上传到S3的完整搜索结果数据
            s3_data = {
                'search_id': search_id,
                'query': query,
                'search_type': search_type,
                'enable_llm': enable_llm,
                'total_results': response.total,
                'results': self._serialize_search_results(response.results),
                'rewritten_terms': response.rewrittenTerms or [],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'created_at': int(datetime.now(timezone.utc).timestamp()),
                'user_id': user_id
            }
            
            # 上传完整数据到S3
            s3_key = self._upload_to_s3(search_id, s3_data)
            if not s3_key:
                return None
            
            # 在DynamoDB中只保存元数据和S3路径
            ddb_item = {
                self.primary_key: search_id,  # 使用动态检测的主键
                'search_id': search_id,  # 保留search_id字段用于兼容性
                'query': query,
                'search_type': search_type,
                'enable_llm': enable_llm,
                'total_results': response.total,
                'results_count': len(response.results),  # 只存储结果数量
                's3_key': s3_key,  # S3对象键
                's3_bucket': self.bucket_name,  # S3存储桶名称
                'rewritten_terms': response.rewrittenTerms or [],
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'created_at': int(datetime.now(timezone.utc).timestamp()),
                'ttl': int(datetime.now(timezone.utc).timestamp()) + (30 * 24 * 60 * 60)  # 30天TTL
            }
            
            # 添加用户ID（如果提供）
            if user_id:
                ddb_item['user_id'] = user_id
            
            # 保存元数据到DynamoDB
            print(f"🔄 正在保存到DynamoDB...")
            print(f"   主键: {self.primary_key} = {search_id}")
            print(f"   DDB项目: {list(ddb_item.keys())}")
            
            self.table.put_item(Item=ddb_item)
            
            print(f"✅ 搜索结果已保存 - ID: {search_id}")
            print(f"   查询: {query}")
            print(f"   搜索类型: {search_type}")
            print(f"   结果数量: {response.total}")
            print(f"   LLM评估: {'启用' if enable_llm else '禁用'}")
            print(f"   S3路径: {s3_key}")
            print(f"   DynamoDB保存成功")
            
            return search_id
            
        except ClientError as e:
            print(f"❌ DynamoDB保存失败 - ClientError: {e}")
            print(f"   错误代码: {e.response.get('Error', {}).get('Code', 'Unknown')}")
            print(f"   错误消息: {e.response.get('Error', {}).get('Message', 'Unknown')}")
            return None
        except Exception as e:
            print(f"❌ 保存失败 - Exception: {e}")
            import traceback
            print(f"   详细错误: {traceback.format_exc()}")
            return None
    
    def get_search_result(self, search_id: str) -> Optional[Dict[str, Any]]:
        """
        根据搜索ID获取完整搜索结果
        
        Args:
            search_id: 搜索ID
            
        Returns:
            完整搜索结果字典，如果未找到返回None
        """
        if not self.table or not self.s3_client:
            print("❌ S3或DynamoDB未初始化，无法获取搜索结果")
            return None
        
        try:
            # 从DynamoDB获取元数据
            response = self.table.get_item(Key={self.primary_key: search_id})
            
            if 'Item' not in response:
                print(f"❌ 未找到搜索ID: {search_id}")
                return None
            
            metadata = response['Item']
            s3_key = metadata.get('s3_key')
            
            if not s3_key:
                print(f"❌ 搜索结果缺少S3路径: {search_id}")
                return None
            
            # 从S3获取完整数据
            full_data = self._download_from_s3(s3_key)
            if not full_data:
                print(f"❌ 无法从S3获取搜索结果: {search_id}")
                return None
            
            # 合并元数据和完整数据
            result = {
                **metadata,
                'results': full_data.get('results', [])
            }
            
            return result
                
        except ClientError as e:
            print(f"❌ 获取搜索结果失败 - ClientError: {e}")
            return None
        except Exception as e:
            print(f"❌ 获取搜索结果失败 - Exception: {e}")
            return None
    
    def get_search_metadata(self, search_id: str) -> Optional[Dict[str, Any]]:
        """
        只获取搜索元数据（不包含完整结果）
        
        Args:
            search_id: 搜索ID
            
        Returns:
            搜索元数据字典，如果未找到返回None
        """
        if not self.table:
            print("❌ DynamoDB表未初始化，无法获取搜索元数据")
            return None
        
        try:
            response = self.table.get_item(Key={self.primary_key: search_id})
            
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
        获取用户的搜索历史（只包含元数据）
        
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
        删除搜索结果（同时删除S3和DynamoDB中的数据）
        
        Args:
            search_id: 搜索ID
            
        Returns:
            删除是否成功
        """
        if not self.table or not self.s3_client:
            print("❌ S3或DynamoDB未初始化，无法删除搜索结果")
            return False
        
        try:
            # 先获取元数据以获得S3键
            metadata = self.get_search_metadata(search_id)
            if not metadata:
                print(f"❌ 未找到搜索结果元数据: {search_id}")
                return False
            
            s3_key = metadata.get('s3_key')
            
            # 删除S3对象
            if s3_key:
                try:
                    self.s3_client.delete_object(
                        Bucket=self.bucket_name,
                        Key=s3_key
                    )
                    print(f"✅ S3对象已删除: {s3_key}")
                except ClientError as e:
                    print(f"⚠️  S3对象删除失败: {e}")
            
            # 删除DynamoDB项目
            self.table.delete_item(Key={self.primary_key: search_id})
            print(f"✅ 搜索结果已删除 - ID: {search_id}")
            return True
            
        except ClientError as e:
            print(f"❌ 删除失败 - ClientError: {e}")
            return False
        except Exception as e:
            print(f"❌ 删除失败 - Exception: {e}")
            return False
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """
        获取缓存统计信息
        
        Returns:
            缓存统计信息字典
        """
        stats = {}
        
        # DynamoDB统计
        if self.table:
            try:
                table_info = self.table.meta.client.describe_table(TableName=self.table_name)
                stats.update({
                    "dynamodb_table_name": self.table_name,
                    "dynamodb_table_status": table_info['Table']['TableStatus'],
                    "dynamodb_item_count": table_info['Table']['ItemCount'],
                    "dynamodb_table_size_bytes": table_info['Table']['TableSizeBytes'],
                })
            except Exception as e:
                stats["dynamodb_error"] = f"获取DynamoDB统计失败: {e}"
        else:
            stats["dynamodb_error"] = "DynamoDB表未初始化"
        
        # S3统计
        if self.s3_client:
            try:
                # 获取存储桶信息
                bucket_location = self.s3_client.get_bucket_location(Bucket=self.bucket_name)
                stats.update({
                    "s3_bucket_name": self.bucket_name,
                    "s3_bucket_region": bucket_location.get('LocationConstraint', 'us-east-1'),
                })
            except Exception as e:
                stats["s3_error"] = f"获取S3统计失败: {e}"
        else:
            stats["s3_error"] = "S3客户端未初始化"
        
        stats["region"] = self.region_name
        return stats 