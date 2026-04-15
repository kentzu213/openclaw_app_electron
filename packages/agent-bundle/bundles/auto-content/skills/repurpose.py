"""Content Repurposer — Chuyển đổi content giữa các format."""
async def execute(context, params=None):
    source = (params or {}).get('content', '')
    from_format = (params or {}).get('from', 'blog')
    to_format = (params or {}).get('to', 'social')
    
    prompt = f"""Chuyển đổi content từ {from_format} sang {to_format}:
{source[:2000]}

Giữ nguyên ý chính, tối ưu cho format {to_format}."""
    
    result = await context.llm.generate(prompt)
    return {'status': 'success', 'original_format': from_format, 'target_format': to_format, 'content': result}
