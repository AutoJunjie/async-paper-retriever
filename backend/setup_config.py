#!/usr/bin/env python3
"""
配置设置脚本 - 设置最佳的S3+DynamoDB缓存配置
"""

import os

def setup_optimal_config():
    """设置最佳配置"""
    print("🔧 设置最佳的S3+DynamoDB缓存配置...")
    
    # 推荐的配置
    config = {
        'AWS_REGION': 'us-west-2',
        'DYNAMODB_TABLE_NAME': 'asyncSearchCache',
        'DYNAMODB_REGION': 'us-west-2',
        'S3_BUCKET': 'async-papaer-search-results',
        'USE_S3_CACHE': 'true',
        'DEBUG': 'true'
    }
    
    print("\n📋 推荐配置:")
    for key, value in config.items():
        print(f"   {key}={value}")
        os.environ[key] = value
    
    print("\n✅ 环境变量已设置")
    
    # 验证配置
    print("\n🔍 验证配置...")
    from utils.settings import settings
    print(f"   DynamoDB表名: {settings.DYNAMODB_TABLE_NAME}")
    print(f"   S3存储桶: {settings.S3_BUCKET_NAME}")
    print(f"   使用S3缓存: {settings.USE_S3_CACHE}")
    
    # 测试初始化
    print("\n🧪 测试缓存初始化...")
    try:
        from utils.s3_cache import S3Cache
        cache = S3Cache()
        print(f"   S3客户端: {'✅' if cache.s3_client else '❌'}")
        print(f"   DynamoDB表: {'✅' if cache.table else '❌'}")
        print(f"   检测到的主键: {cache.primary_key}")
        
        if cache.s3_client and cache.table:
            print("✅ 缓存初始化成功！")
            return True
        else:
            print("❌ 缓存初始化失败")
            return False
            
    except Exception as e:
        print(f"❌ 缓存初始化出错: {e}")
        return False

def create_env_file():
    """创建.env文件"""
    env_content = """# AWS配置
AWS_REGION=us-west-2

# DynamoDB配置
DYNAMODB_TABLE_NAME=asyncSearchCache
DYNAMODB_REGION=us-west-2

# S3缓存配置
S3_BUCKET=async-papaer-search-results
USE_S3_CACHE=true

# 其他配置
DEBUG=true
"""
    
    try:
        with open('.env', 'w', encoding='utf-8') as f:
            f.write(env_content)
        print("✅ .env文件已创建")
        return True
    except Exception as e:
        print(f"❌ 创建.env文件失败: {e}")
        return False

if __name__ == "__main__":
    print("🚀 开始配置Async FastAPI项目...")
    
    # 设置环境变量
    if setup_optimal_config():
        print("\n🎉 配置完成！现在可以使用S3+DynamoDB混合缓存了")
        
        # 尝试创建.env文件
        print("\n📝 创建.env文件...")
        create_env_file()
        
        print("\n💡 使用建议:")
        print("   1. 现在可以运行应用程序，缓存将自动使用S3+DynamoDB")
        print("   2. 大型搜索结果将存储在S3中，突破400KB限制")
        print("   3. DynamoDB只存储元数据，查询速度更快")
        print("   4. 如需测试，可运行: python debug_s3_cache.py")
    else:
        print("\n❌ 配置失败，请检查AWS凭证和权限") 