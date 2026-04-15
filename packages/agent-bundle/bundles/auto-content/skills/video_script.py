"""Video Script Writer — Viết kịch bản video ngắn."""
async def execute(context, params=None):
    topic = (params or {}).get('topic', '')
    platform = (params or {}).get('platform', 'tiktok')
    duration = (params or {}).get('duration', 60)
    
    prompt = f"""Viết kịch bản video {platform} ({duration}s) về: "{topic}"
Brand: {context.config.get('brand_name', '')}

Format:
🎬 Hook (3s): ...
📝 Nội dung chính (body): ...
🎯 CTA (cuối): ...
🎵 Nhạc gợi ý: ...
📌 Caption: ..."""
    
    script = await context.llm.generate(prompt)
    return {'status': 'success', 'script': script, 'platform': platform}
