import json
import boto3
import numpy as np
import os

class BGEReranker:
    def __init__(self, endpoint_name):
        self.endpoint_name = endpoint_name
        # 显式指定AWS区域
        aws_region = os.getenv('AWS_REGION', 'us-west-2')
        self.runtime = boto3.client('sagemaker-runtime', region_name=aws_region)
        
    def rerank(self, query, passages, top_k=None):
        """
        使用BGE模型对文本段落进行重排序
        
        Args:
            query (str): 查询文本
            passages (list): 待重排序的文本段落列表
            top_k (int, optional): 返回前k个结果，默认返回所有结果
            
        Returns:
            list: 重排序后的结果，每个元素包含文本内容和分数
        """
        if not passages:
            return []
            
        # 构建正确的输入格式
        input_data = {
            "text_1": query,
            "text_2": passages,
            "model": "bge-reranker-v2-m3"
        }
            
        try:
            response = self.runtime.invoke_endpoint(
                EndpointName=self.endpoint_name,
                ContentType='application/json',
                Body=json.dumps(input_data)
            )
            
            response_body = json.loads(response['Body'].read().decode())
            
            if isinstance(response_body, dict) and 'data' in response_body:
                # 从data字段中提取分数
                scores = [item['score'] for item in response_body['data']]
                results = [
                    {"text": text, "score": float(score)} 
                    for text, score in zip(passages, scores)
                ]
                results.sort(key=lambda x: x['score'], reverse=True)
                
                if top_k:
                    results = results[:top_k]
                    
                return results
            else:
                print(f"意外的响应格式: {response_body}")
                return []
            
        except Exception as e:
            print(f"重排序过程中发生错误: {str(e)}")
            return []