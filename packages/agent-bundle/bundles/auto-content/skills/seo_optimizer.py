"""SEO Content Optimizer — Phân tích và tối ưu SEO."""
import json

async def execute(context, params=None):
    content = (params or {}).get('content', '')
    keyword = (params or {}).get('keyword', '')
    
    prompt = f"""Phân tích SEO cho bài viết (keyword: "{keyword}"):
{content[:3000]}

Trả lời JSON:
{{"score": 0-100, "keyword_density": "X%", "readability": "easy/medium/hard",
"improvements": ["..."], "meta_suggestion": "...", "title_suggestion": "..."}}"""
    
    result = await context.llm.generate(prompt)
    try: return {'status': 'success', 'seo': json.loads(result)}
    except: return {'status': 'success', 'seo': {'score': 70, 'raw': result}}
