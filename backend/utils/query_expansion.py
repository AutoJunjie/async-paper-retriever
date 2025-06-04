"""
Async FastAPI 查询扩展模块
整合查询重写和术语提取功能
"""

import os
import json
import re
import logging
from typing import List
import openai
from dotenv import load_dotenv

load_dotenv()

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 设置 OpenAI API 配置
openai.api_key = os.getenv("OPENAI_API_KEY", "")
openai.api_base = os.getenv("OPENAI_API_BASE", "http://127.0.0.1:8000/v1")

# 定义 prompt 模板
QUERY_REWRITE_PROMPT = """
# 医学术语处理与多语言专业扩展规则

请分析输入的医学术语，执行以下任务：

1. **提取医学主体**：
   - 从输入的医学术语中识别并提取核心疾病/状况主体
   - 将此核心主体作为"entity"字段的值
   - 必须是最具代表性的标准医学术语

2. **多语言专业扩展规则**：
   - 为医学主体提供10个不同的相关术语，每个包含中文、英文全称和英文缩写
   - 确保10个扩展项彼此不同，避免重复内容
   - 中文术语(zh)应纯净简洁，不包含括号和额外说明
   - 其他信息如ICD编码或亚型说明应放在单独字段中
   - 如需包含分类信息，使用"category"字段
   - 如需包含ICD编码，使用"icd"字段
   - 避免在主要字段中使用括号

3. **术语选择标准**：
   - 优先使用国际通用的标准医学术语
   - 包含该疾病在不同分类系统中的正式名称
   - 纳入临床实践中常用的专业变体表达
   - 可包含重要的亚型或细分类别
   - 必须与原疾病在医学定义上完全一致

4. **输出格式要求**：
   - 使用JSON格式
   - 必填字段：zh(中文术语)、en(英文全称)、abbr(英文缩写)
   - 可选字段：category(分类信息)、icd(ICD编码)
   - 所有中文内容必须使用规范的简体中文
   - 英文缩写必须为通用医学缩写

输出格式示例：
```
Expansion = {{
    "qid": "{query}",
    "entity": "提取的医学主体",
    "additional_info": [
        {{
            "zh": "中文术语1",
            "en": "英文全称1",
            "abbr": "英文缩写1",
            "category": "分类信息（可选）",
            "icd": "ICD编码（可选）"
        }},
        // ... 其他9个扩展项 ...
    ]
}}
```

注意事项：
1. 所有返回内容必须是规范的JSON格式
2. 确保扩展词与原疾病指向完全相同的医学概念
3. 严格避免混入其他相似但不同的疾病名称
4. 扩展词必须能通过医学文献验证是同一疾病
5. 请将输出结果放在<json>标签中
6. additional_info数组必须包含10个不同的扩展项
7. 提取实体后再进行扩写
"""

def rewrite_query(query: str) -> str:
    """
    使用 OpenAI API 对医学领域查询关键词进行改写，返回标准医学术语。

    参数:
        query: 原始查询关键词
    返回:
        改写后的查询字符串
    """
    # 如果查询为空或太短，直接返回原始查询
    if not query or len(query.strip()) < 2:
        logger.warning(f"查询太短或为空，跳过重写: '{query}'")
        return query
        
    # 如果没有配置OpenAI API，直接返回原始查询
    if not openai.api_key:
        logger.warning("未配置OpenAI API密钥，跳过查询重写")
        return query
        
    prompt = QUERY_REWRITE_PROMPT.format(query=query)
    logger.info(f"执行 query rewrite, 原始查询: '{query}'")
    
    try:
        # 使用新的 client API 调用
        client = openai.OpenAI(api_key=openai.api_key, base_url=openai.api_base)
        response = client.chat.completions.create(
            model="Qwen2.5-72B-Instruct-AWQ",
            messages=[
                {"role": "system", "content": "你是一名专业的医学信息标准化专家。请严格按照要求返回JSON格式的结果，并将结果放在<json>标签中。"},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=1024
        )
        result = response.choices[0].message.content.strip()
        
        # 检查结果是否包含<json>标签
        if "<json>" not in result:
            # 尝试提取JSON内容并添加标签
            json_match = re.search(r'\{.*\}', result, re.DOTALL)
            if json_match:
                json_content = json_match.group(0)
                try:
                    # 验证JSON格式是否正确
                    json.loads(json_content)
                    result = f"<json>{json_content}</json>"
                except json.JSONDecodeError:
                    logger.warning(f"JSON格式验证失败，使用原始查询: '{query}'")
                    return query
            else:
                logger.warning(f"未找到JSON内容，使用原始查询: '{query}'")
                return query
            
        logger.info(f"Query rewrite 完成: {result}")
        return result
    except Exception as e:
        logger.error(f"调用 OpenAI API 出错: {e}")
        return query

def extract_terms_from_rewrite(rewritten_query: str) -> List[str]:
    """
    从重写的查询中提取搜索词
    
    Args:
        rewritten_query: 重写后的查询字符串
    Returns:
        搜索词列表，包含原始实体和扩展的术语
    """
    search_terms = []
    
    try:
        start_idx = rewritten_query.find('<json>')
        end_idx = rewritten_query.find('</json>')
        
        if start_idx == -1 or end_idx == -1:
            return [rewritten_query.strip()]
        
        json_str = rewritten_query[start_idx + 6:end_idx].strip()
        data = json.loads(json_str)
        
        # 添加原始查询
        qid = data.get('qid', '')
        if qid and isinstance(qid, str):
            search_terms.append(qid)
        
        # 添加实体
        entity = data.get('entity', '')
        if entity and isinstance(entity, str) and entity not in search_terms:
            search_terms.append(entity)
        
        # 处理additional_info
        additional_info = data.get('additional_info', [])
        if isinstance(additional_info, list):
            for info in additional_info:
                if isinstance(info, dict):
                    for key in ['zh', 'en', 'abbr']:
                        term = info.get(key, '')
                        if term and isinstance(term, str) and term not in search_terms:
                            search_terms.append(term)
                elif isinstance(info, str) and info not in search_terms:
                    search_terms.append(info)
    
    except json.JSONDecodeError as e:
        logger.error(f"JSON解析错误: {e}")
        return [rewritten_query.strip()]
    except Exception as e:
        logger.error(f"提取搜索词时发生错误: {e}")
        return [rewritten_query.strip()]
    
    return search_terms if search_terms else [rewritten_query.strip()]

def expand_query(query: str) -> List[str]:
    """
    完整的查询扩展流程：重写查询并提取术语
    
    Args:
        query: 原始查询
    Returns:
        扩展后的搜索词列表
    """
    # 重写查询
    rewritten_query = rewrite_query(query)
    
    # 提取术语
    expanded_terms = extract_terms_from_rewrite(rewritten_query)
    
    logger.info(f"查询扩展完成: '{query}' -> {expanded_terms}")
    return expanded_terms

if __name__ == '__main__':
    # 示例测试
    sample_query = "肩周炎"
    expanded = expand_query(sample_query)
    print("原始查询:", sample_query)
    print("扩展后的术语:", expanded) 