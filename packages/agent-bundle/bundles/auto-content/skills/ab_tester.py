"""A/B Content Tester — Tạo biến thể content để test."""
async def execute(context, params=None):
    original = (params or {}).get('content', '')
    variations = (params or {}).get('variations', 2)
    
    prompt = f"""Tạo {variations} biến thể A/B test cho content:
"{original}"

Mỗi biến thể thay đổi: headline, hook, CTA, hoặc tone.
Label rõ: Variant A, Variant B, ..."""
    
    result = await context.llm.generate(prompt)
    return {'status': 'success', 'original': original, 'variants': result}
