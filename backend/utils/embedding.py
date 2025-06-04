import json
import boto3
import numpy as np
from typing import List, Union
import os

class BGEM3Embedder:
    def __init__(self, endpoint_name: str):
        """
        初始化BGE-M3 Embedder
        
        Args:
            endpoint_name: SageMaker端点名称
        """
        self.endpoint_name = endpoint_name
        # 配置 AWS 客户端
        aws_region = os.getenv('AWS_REGION')
        if not aws_region:
            raise ValueError("Missing AWS_REGION environment variable")
            
        self.client = boto3.client(
            'sagemaker-runtime',
            region_name=aws_region,
            aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
            aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY')
        )
        
    def get_embeddings(self, texts: Union[str, List[str]], batch_size: int = 32) -> np.ndarray:
        """
        获取文本的embeddings，支持批量处理
        
        Args:
            texts: 单个文本字符串或文本列表
            batch_size: 批处理大小，默认32
            
        Returns:
            numpy数组形式的embeddings
        """
        if isinstance(texts, str):
            texts = [texts]
        
        all_embeddings = []
        
        # 批量处理
        for i in range(0, len(texts), batch_size):
            batch_texts = texts[i:i + batch_size]
            
            # 准备输入数据
            payload = {
                "input": batch_texts
            }
            
            # 调用SageMaker端点
            response = self.client.invoke_endpoint(
                EndpointName=self.endpoint_name,
                ContentType='application/json',
                Body=json.dumps(payload)
            )
            
            # 解析响应
            response_body = json.loads(response['Body'].read().decode())
            #print("响应内容：", json.dumps(response_body, indent=2, ensure_ascii=False))
            
            # 获取embeddings数据
            embeddings = response_body['data']
            # 将每个embedding从字典转换为列表
            embeddings = [emb['embedding'] for emb in embeddings]
            all_embeddings.extend(embeddings)
        
        # 将所有embedding转换为numpy数组
        final_embeddings = np.array(all_embeddings)
        return final_embeddings

def main():
    # 使用示例
    endpoint_name = os.getenv('SAGEMAKER_ENDPOINT_NAME')
    if not endpoint_name:
        raise ValueError("Missing SAGEMAKER_ENDPOINT_NAME environment variable")
        
    embedder = BGEM3Embedder(endpoint_name)
    
    # 单个文本示例
    text = "青光眼是一种常见的眼科疾病"
    embedding = embedder.get_embeddings(text)
    #print(f"单个文本的embedding维度: {embedding.shape}")
    
    # 批量文本示例
    texts = [
        "青光眼是一种常见的眼科疾病",
        "糖尿病可能会导致视网膜病变",
        "定期进行眼科检查很重要"
    ]
    embeddings = embedder.get_embeddings(texts, batch_size=2)  # 设置较小的batch_size作为示例
    #print(f"批量文本的embeddings维度: {embeddings.shape}")
    print(f"处理的文本总数: {len(texts)}")

if __name__ == "__main__":
    main() 