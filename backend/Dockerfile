FROM python:3.9-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制必要的文件
COPY server.py .
COPY sagemaker_bge_m3.py .
COPY requirements.txt .
COPY bge_rerank.py .
COPY query_rewrite.py .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5000

CMD ["python", "-u", "server.py"] 