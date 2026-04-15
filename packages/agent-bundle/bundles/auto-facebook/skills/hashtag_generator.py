"""Hashtag Generator — Gợi ý hashtag tối ưu."""
async def execute(context, params=None):
    topic = (params or {}).get('topic', '')
    if not topic: return {'status': 'error', 'message': 'Topic required'}
    
    prompt = f"""Tạo 10 hashtag tối ưu cho bài viết Facebook về: "{topic}"
Chia nhóm: 3 popular, 4 medium, 3 niche. Format: #hashtag"""
    hashtags = await context.llm.generate(prompt)
    return {'status': 'success', 'hashtags': hashtags}
