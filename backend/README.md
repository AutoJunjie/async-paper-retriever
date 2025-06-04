# Async FastAPI Search Service - 简化版本

一个基于FastAPI的医学文献搜索API服务，采用模块化架构设计。

## 🏗️ 项目结构（模块化版）

```
backend/
├── main.py              # 主应用文件（核心业务逻辑和启动入口）
├── test_api.py          # 测试文件
├── utils/               # 工具模块
│   ├── __init__.py      # 模块初始化
│   ├── settings.py      # 配置管理
│   ├── models.py        # 数据模型
│   ├── embedding.py     # BGE-M3嵌入服务
│   ├── query_expansion.py  # 查询扩展服务
│   ├── rerank.py        # BGE重排序服务
│   └── dynamodb_cache.py   # DynamoDB缓存服务
├── requirements.txt     # 依赖包
├── Dockerfile          # Docker配置
├── .gitignore          # Git忽略文件
└── README.md           # 项目说明
```

## ✨ 特性

- **模块化架构**: 配置、模型、业务逻辑分离，便于维护和扩展
- **多种搜索模式**: 
  - **关键词搜索**: 基于精确匹配的传统搜索，支持高亮显示
  - **向量搜索**: 基于BGE-M3语义嵌入的相似性搜索
  - **混合搜索**: 结合关键词和向量搜索的最佳效果，支持多查询词匹配
- **智能查询扩展**: 使用OpenAI API进行医学术语扩展和重写
- **LLM相关性评估**: 可选的智能文献相关性过滤
- **重排序优化**: 使用BGE重排序模型优化搜索结果排序
- **自动补充机制**: 关键词搜索不足时自动使用向量搜索补充
- **DynamoDB缓存**: 自动将每次搜索结果保存到DynamoDB，支持结果追溯和分析
- **缓存禁用**: 自动禁用Python字节码缓存
- **健康检查**: 提供服务状态监控端点
- **API文档**: 自动生成OpenAPI文档

## 📁 模块说明

### utils/settings.py
- 使用Pydantic Settings管理所有配置
- 支持环境变量和.env文件
- 集中管理OpenSearch、SageMaker、OpenAI等配置

### utils/models.py
- 定义所有Pydantic数据模型
- SearchRequest: 搜索请求模型
- SearchResult: 搜索结果项模型
- SearchResponse: 搜索响应模型（包含search_id字段）

### utils/dynamodb_cache.py
- DynamoDB缓存管理器（传统方式）
- 自动保存每次搜索的完整结果到DynamoDB
- 支持搜索结果的查询、删除和统计
- 使用UUID生成唯一搜索ID
- 支持TTL自动过期（30天）
- ⚠️ 注意：大型搜索结果可能超过DynamoDB项目大小限制（400KB）

### utils/s3_cache.py
- S3+DynamoDB混合缓存管理器（推荐）
- 将完整搜索结果存储到S3，在DynamoDB中只存储元数据和S3路径
- 解决DynamoDB项目大小限制问题
- 支持大型搜索结果的存储
- 提供元数据快速查询和完整结果按需加载
- 自动管理S3和DynamoDB的数据一致性
- **自动检测DynamoDB表主键结构**，兼容现有表

### utils/query_expansion.py
- 整合查询重写和术语提取功能
- 使用OpenAI API进行医学术语扩展
- 支持多语言术语提取（中文、英文、缩写）
- 提供完整的查询扩展流程

### main.py
- FastAPI应用主文件和启动入口
- AsyncPaperSearch搜索引擎类（封装所有搜索功能）
- 服务初始化和业务逻辑
- API端点定义
- 直接启动支持（使用dotenv加载环境变量）

## 🚀 快速开始

### 1. 环境准备

```bash
# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt
```

### 2. 环境变量配置

创建 `.env` 文件并配置以下环境变量：

```bash
# 创建 .env 文件
touch .env
```

在 `.env` 文件中添加以下配置：

```env
# OpenSearch 配置
OPENSEARCH_HOST=your-opensearch-host
OPENSEARCH_PORT=443
OPENSEARCH_USERNAME=your-username
OPENSEARCH_PASSWORD=your-password
OPENSEARCH_INDEX_NAME=your-index-name

# SageMaker 配置
SAGEMAKER_ENDPOINT_NAME=your-bge-m3-endpoint
SAGEMAKER_ENDPOINT_RERANK_NAME=your-rerank-endpoint  # 可选

# 功能开关
ENABLE_RERANK=true  # 可选

# OpenAI 配置
OPENAI_API_KEY=your-openai-key  # 可选
OPENAI_API_BASE=http://127.0.0.1:8000/v1  # 可选

# DynamoDB 配置（可选）
# AWS_ACCESS_KEY_ID=your-access-key  # 通过AWS CLI或IAM角色配置
# AWS_SECRET_ACCESS_KEY=your-secret-key  # 通过AWS CLI或IAM角色配置

# S3缓存配置（推荐）
USE_S3_CACHE=true  # 启用S3+DynamoDB混合缓存
S3_BUCKET=async-papaer-search-results  # S3存储桶名称
# AWS_DEFAULT_REGION=us-west-2  # 通过AWS CLI或环境变量配置

# 运行环境
ENVIRONMENT=development
```

### 3. 启动服务

```bash
# 直接启动（推荐）
python main.py

# 或使用uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 4. 访问服务

- API文档: http://localhost:8000/docs
- 健康检查: http://localhost:8000/health
- 搜索API: http://localhost:8000/search
- 缓存统计: http://localhost:8000/cache/stats

## 📡 API端点

### POST /search

JSON请求搜索：

```bash
# 关键词搜索
curl -X POST "http://localhost:8000/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "糖尿病",
    "page": 1,
    "pageSize": 10,
    "searchType": "keyword",
    "enableLlm": false
  }'

# 向量搜索（启用LLM评估）
curl -X POST "http://localhost:8000/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "糖尿病",
    "page": 1,
    "pageSize": 10,
    "searchType": "vector",
    "enableLlm": true
  }'
```

### GET /cache/{search_id}

获取缓存的搜索结果：

```bash
curl "http://localhost:8000/cache/550e8400-e29b-41d4-a716-446655440000"
```

### GET /cache/stats

获取缓存统计信息：

```bash
curl "http://localhost:8000/cache/stats"
```

### DELETE /cache/{search_id}

删除缓存的搜索结果：

```bash
curl -X DELETE "http://localhost:8000/cache/550e8400-e29b-41d4-a716-446655440000"
```

### 响应格式

```json
{
  "total": 100,
  "results": [
    {
      "id": "doc_123",
      "title": "糖尿病治疗指南",
      "keywords": ["糖尿病", "治疗", "指南"],
      "abstract": "本文介绍了糖尿病的最新治疗方法...",
      "score": 8.5,
      "source": "keyword",
      "matched_keywords": ["糖尿病", "diabetes"],
      "relevance_reason": null
    }
  ],
  "searchType": "keyword",
  "rewrittenTerms": ["糖尿病", "Diabetes Mellitus", "DM", "1型糖尿病"],
  "search_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## 🗄️ DynamoDB表结构

### asyncSearchCache表

该表用于存储搜索结果缓存，表结构如下：

**主键**:
- `cache_key` (String): 缓存键，使用UUID生成

**属性**:
- `query` (String): 搜索查询词
- `search_type` (String): 搜索类型 (keyword/vector/hybrid)
- `enable_llm` (Boolean): 是否启用LLM评估
- `total_results` (Number): 搜索结果总数
- `results` (List): 搜索结果详细信息
- `rewritten_terms` (List): 重写的搜索词
- `timestamp` (String): ISO格式时间戳
- `created_at` (Number): Unix时间戳
- `ttl` (Number): TTL过期时间 (30天)
- `user_id` (String): 用户ID (可选)

**创建表的AWS CLI命令**:

```bash
aws dynamodb create-table \
    --table-name asyncSearchCache \
    --attribute-definitions \
        AttributeName=cache_key,AttributeType=S \
    --key-schema \
        AttributeName=cache_key,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region us-west-2
```

## 🏗️ 缓存架构

### 传统DynamoDB缓存
- 将完整搜索结果直接存储在DynamoDB中
- 优点：简单，查询快速
- 缺点：受DynamoDB项目大小限制（400KB），大型搜索结果会失败

### S3+DynamoDB混合缓存（推荐）
- **DynamoDB**: 存储搜索元数据（查询词、搜索类型、结果数量、S3路径等）
- **S3**: 存储完整的搜索结果数据
- **优点**:
  - 突破DynamoDB大小限制
  - 支持任意大小的搜索结果
  - 元数据查询快速（DynamoDB）
  - 完整数据按需加载（S3）
  - 成本效益更好（S3存储成本低）
- **缺点**:
  - 架构稍复杂
  - 获取完整结果需要额外的S3请求

### 使用建议
- 小型搜索结果（<100KB）：可使用任一方案
- 大型搜索结果（>100KB）：建议使用S3+DynamoDB混合缓存
- 生产环境：推荐使用S3+DynamoDB混合缓存

## 🪣 S3存储桶配置

### 创建S3存储桶

如果使用S3+DynamoDB混合缓存（推荐），需要创建S3存储桶：

```bash
# 创建S3存储桶（如果还没有的话）
aws s3 mb s3://async-papaer-search-results --region us-west-2

# 启用版本控制（可选）
aws s3api put-bucket-versioning \
    --bucket async-papaer-search-results \
    --versioning-configuration Status=Enabled

# 设置生命周期策略（可选，30天后删除）
aws s3api put-bucket-lifecycle-configuration \
    --bucket async-papaer-search-results \
    --lifecycle-configuration file://lifecycle.json
```

**lifecycle.json示例**:
```json
{
    "Rules": [
        {
            "ID": "DeleteOldSearchResults",
            "Status": "Enabled",
            "Filter": {
                "Prefix": "search-results/"
            },
            "Expiration": {
                "Days": 30
            }
        }
    ]
}
```

## 🧪 测试

运行API测试：

```bash
python test_api.py
```

运行DynamoDB缓存测试：

```bash
python test_dynamodb_cache.py
```

运行S3缓存测试：

```bash
python test_s3_cache.py
```

运行完整使用示例：

```bash
python example_search_with_cache.py
```

运行S3缓存使用示例：

```bash
python example_s3_cache.py
```

测试覆盖：
- ✅ 根端点测试
- ✅ 健康检查测试
- ✅ GET搜索测试
- ✅ POST搜索测试
- ✅ 参数验证测试
- ✅ DynamoDB缓存功能测试
- ✅ S3+DynamoDB混合缓存功能测试

## 🐳 Docker部署

```bash
# 构建镜像
docker build -t async-fastapi .

# 运行容器
docker run -p 8000:8000 \
  -e OPENSEARCH_HOST="your-host" \
  -e OPENSEARCH_USERNAME="your-username" \
  -e OPENSEARCH_PASSWORD="your-password" \
  -e OPENSEARCH_INDEX_NAME="your-index" \
  -e SAGEMAKER_ENDPOINT_NAME="your-endpoint" \
  async-fastapi
```

## 📡 API端点

### 搜索相关
- `POST /search` - 执行搜索
- `GET /health` - 健康检查

### 缓存相关
- `GET /cache/{search_id}` - 获取完整搜索结果
- `GET /cache/{search_id}/metadata` - 获取搜索元数据（不包含完整结果）
- `DELETE /cache/{search_id}` - 删除缓存的搜索结果
- `GET /cache/stats` - 获取缓存统计信息

## 🔍 搜索模式详解

### 混合搜索改进

混合搜索现在支持多查询词匹配，具有以下特性：

- **多查询词支持**: 类似关键词搜索，支持同时匹配多个扩展后的查询词
- **双重匹配机制**: 
  - **精确匹配**: 使用bool查询在title、keywords、abstract字段中精确匹配查询词
  - **语义匹配**: 使用BGE-M3向量嵌入进行语义相似性匹配
- **权重优化**: keywords字段权重最高(10x)，title次之(5x)，abstract最低(2x)
- **高亮显示**: 支持匹配关键词的高亮显示
- **智能重排序**: 使用BGE重排序模型进一步优化结果排序
- **最佳效果**: 结合精确匹配的准确性和语义匹配的召回率

### 搜索模式对比

| 搜索模式 | 匹配方式 | 查询词支持 | 高亮显示 | 语义理解 | 重排序 | 适用场景 |
|---------|---------|-----------|---------|---------|-------|---------|
| 关键词搜索 | 精确匹配 | 多查询词 | ✅ | ❌ | ✅ | 精确查找已知术语 |
| 向量搜索 | 语义匹配 | 单查询 | ❌ | ✅ | ❌ | 概念相似性搜索 |
| 混合搜索 | 精确+语义 | 多查询词 | ✅ | ✅ | ✅ | 综合最佳效果 |

## 🔧 配置说明

### 必需配置

- `OPENSEARCH_HOST`: OpenSearch服务器地址
- `OPENSEARCH_USERNAME`: OpenSearch用户名
- `OPENSEARCH_PASSWORD`: OpenSearch密码
- `OPENSEARCH_INDEX_NAME`: 搜索索引名称
- `SAGEMAKER_ENDPOINT_NAME`: BGE-M3嵌入模型端点

### 可选配置

- `OPENSEARCH_PORT`: OpenSearch端口（默认443）
- `SAGEMAKER_ENDPOINT_RERANK_NAME`: 重排序模型端点
- `ENABLE_RERANK`: 是否启用重排序（默认true）
- `OPENAI_API_KEY`: OpenAI API密钥
- `ENVIRONMENT`: 运行环境（development/production）

## 📝 开发说明

### 架构设计

模块化版本将功能按职责分离：

1. **配置管理** (`utils/settings.py`): 使用Pydantic Settings管理环境变量
2. **数据模型** (`utils/models.py`): 定义请求和响应的数据结构
3. **服务初始化** (`main.py`): 初始化OpenSearch、BGE-M3、重排序服务
4. **工具函数** (`main.py`): 查询处理、结果解析等辅助函数
5. **API端点** (`main.py`): FastAPI路由和处理逻辑
6. **业务服务** (`utils/`): BGE-M3嵌入、查询重写、重排序等专业服务

### 缓存管理

项目自动禁用Python字节码缓存：
- 启动时设置`PYTHONDONTWRITEBYTECODE=1`
- `.gitignore`忽略所有缓存文件
- 测试运行后不会生成缓存文件

### 错误处理

- 服务初始化失败时优雅降级
- 详细的错误日志和状态提示
- API参数验证和错误响应

## 🔍 故障排除

### 常见问题

1. **服务启动失败**
   - 检查环境变量是否正确设置
   - 确认网络连接和服务可达性

2. **搜索无结果**
   - 检查OpenSearch索引是否存在
   - 确认索引中有数据

3. **嵌入服务错误**
   - 检查SageMaker端点是否正常
   - 确认AWS凭证配置正确

4. **DynamoDB主键错误**
   - 错误信息：`Missing the key cache_key in the item`
   - 解决方案：S3Cache会自动检测表的主键结构
   - 如果仍有问题，检查表是否存在且有正确的访问权限

### 日志查看

服务启动时会显示各组件的初始化状态：
- ✅ 成功初始化
- ❌ 初始化失败
- ⚠️  配置缺失或服务不可用

## 📄 许可证

MIT License

## 🚀 快速使用S3缓存

### 1. 环境变量配置
在您的 `.env` 文件中添加：
```bash
USE_S3_CACHE=true
S3_BUCKET=async-papaer-search-results
```

### 2. 验证配置
```bash
python test_config.py
```

### 3. 测试S3缓存
```bash
python test_s3_cache.py
```

### 4. 运行示例
```bash
python example_s3_cache.py
```

现在您的搜索系统将使用S3+DynamoDB混合缓存，解决了DynamoDB 400KB大小限制的问题！🎉

## 🤝 贡献

欢迎提交Issue和Pull Request！ 