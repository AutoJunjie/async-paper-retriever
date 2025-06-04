#!/usr/bin/env python3
import os
from utils.settings import settings

# 设置环境变量
os.environ['S3_BUCKET'] = 'async-papaer-search-results'
os.environ['USE_S3_CACHE'] = 'true'

print("🔍 当前DynamoDB表配置:")
print(f"   环境变量 DYNAMODB_TABLE_NAME: {os.getenv('DYNAMODB_TABLE_NAME', '未设置')}")
print(f"   settings.DYNAMODB_TABLE_NAME: {settings.DYNAMODB_TABLE_NAME}")
print(f"   settings.DYNAMODB_REGION: {settings.DYNAMODB_REGION}")

# 检查两个可能的表
import boto3
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb', region_name=settings.DYNAMODB_REGION)

tables_to_check = ['async-search-cache', 'asyncSearchCache']

for table_name in tables_to_check:
    try:
        table = dynamodb.Table(table_name)
        table_info = table.meta.client.describe_table(TableName=table_name)
        
        print(f"\n📋 表: {table_name}")
        print(f"   状态: {table_info['Table']['TableStatus']}")
        print(f"   主键: {table_info['Table']['KeySchema']}")
        print(f"   条目数: {table_info['Table']['ItemCount']}")
        print(f"   大小: {table_info['Table']['TableSizeBytes']} bytes")
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print(f"\n❌ 表 {table_name} 不存在")
        else:
            print(f"\n❌ 检查表 {table_name} 时出错: {e}")
    except Exception as e:
        print(f"\n❌ 检查表 {table_name} 时出错: {e}")

print(f"\n💡 建议:")
print(f"   如果您想使用 asyncSearchCache 表，请在 .env 文件中添加:")
print(f"   DYNAMODB_TABLE_NAME=asyncSearchCache")
print(f"   ")
print(f"   如果您想使用 async-search-cache 表，请确保该表存在且主键为 cache_key") 