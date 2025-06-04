"""
Async FastAPI 配置管理模块
"""

import os
from typing import List, Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """应用设置"""
    
    # 基本信息
    PROJECT_NAME: str = "Async FastAPI Search Service"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # CORS设置
    ALLOWED_HOSTS: List[str] = ["*"]
    
    # OpenSearch配置
    OPENSEARCH_HOST: str = os.getenv("OPENSEARCH_HOST", "")
    OPENSEARCH_PORT: int = int(os.getenv("OPENSEARCH_PORT", "443"))
    OPENSEARCH_USERNAME: str = os.getenv("OPENSEARCH_USERNAME", "")
    OPENSEARCH_PASSWORD: str = os.getenv("OPENSEARCH_PASSWORD", "")
    OPENSEARCH_INDEX_NAME: str = os.getenv("OPENSEARCH_INDEX_NAME", "")
    
    # SageMaker配置
    SAGEMAKER_ENDPOINT_NAME: str = os.getenv("SAGEMAKER_ENDPOINT_NAME", "")
    SAGEMAKER_ENDPOINT_RERANK_NAME: Optional[str] = os.getenv("SAGEMAKER_ENDPOINT_RERANK_NAME")
    
    # 功能开关
    ENABLE_RERANK: bool = os.getenv("ENABLE_RERANK", "true").lower() == "true"
    
    # OpenAI配置
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
    
    # DynamoDB缓存配置
    ENABLE_CACHE: bool = os.getenv("ENABLE_CACHE", "true").lower() == "true"
    DYNAMODB_TABLE_NAME: str = os.getenv("DYNAMODB_TABLE_NAME", "async-search-cache")
    DYNAMODB_REGION: str = os.getenv("DYNAMODB_REGION", "us-east-1")
    AWS_ACCESS_KEY_ID: Optional[str] = os.getenv("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: Optional[str] = os.getenv("AWS_SECRET_ACCESS_KEY")
    
    # S3缓存配置
    S3_BUCKET_NAME: str = os.getenv("S3_BUCKET", "async-papaer-search-results")
    USE_S3_CACHE: bool = os.getenv("USE_S3_CACHE", "true").lower() == "true"
    
    # 异步LLM评估配置
    ENABLE_ASYNC_LLM: bool = os.getenv("ENABLE_ASYNC_LLM", "true").lower() == "true"
    LLM_MAX_WORKERS: int = int(os.getenv("LLM_MAX_WORKERS", "5"))
    LLM_BATCH_SIZE: int = int(os.getenv("LLM_BATCH_SIZE", "10"))
    LLM_RATE_LIMIT: float = float(os.getenv("LLM_RATE_LIMIT", "1.0"))
    
    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "ignore"  # 忽略额外的环境变量

# 创建全局设置实例
settings = Settings() 