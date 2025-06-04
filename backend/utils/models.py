"""
Async FastAPI 数据模型模块
"""

from typing import List, Optional
from pydantic import BaseModel, Field

class SearchRequest(BaseModel):
    """搜索请求模型"""
    query: str = Field(..., description="搜索查询词", min_length=1)
    page: int = Field(1, description="页码", ge=1)
    pageSize: int = Field(30, description="每页结果数", ge=1, le=10000)
    searchType: str = Field("keyword", description="搜索类型")
    enableLlm: bool = Field(False, description="是否启用LLM相关性评估")

class SearchResult(BaseModel):
    """搜索结果项模型"""
    id: str = Field(..., description="文档ID")
    title: str = Field(..., description="标题")
    keywords: List[str] = Field(default_factory=list, description="关键词")
    abstract: str = Field(..., description="摘要")
    score: float = Field(..., description="相关性评分")
    source: Optional[str] = Field(None, description="来源")
    matched_keywords: Optional[List[str]] = Field(None, description="匹配的关键词")
    relevance_reason: Optional[str] = Field(None, description="相关性原因")

class SearchResponse(BaseModel):
    """搜索响应模型"""
    total: int = Field(..., description="总结果数")
    results: List[SearchResult] = Field(..., description="搜索结果列表")
    searchType: str = Field(..., description="搜索类型")
    rewrittenTerms: Optional[List[str]] = Field(None, description="重写的搜索词")
    search_id: Optional[str] = Field(None, description="搜索缓存ID") 