"""Document Organizer — Phân loại và tổ chức tài liệu."""
async def execute(context, params=None):
    document = (params or {}).get('document', '')
    prompt = f"""Phân loại tài liệu sau vào category phù hợp:
{document[:500]}

Categories: Hợp đồng, Báo cáo, Hóa đơn, Tài liệu kỹ thuật, Meeting notes, Khác
Trả lời: category + tags + tóm tắt ngắn"""
    
    result = await context.llm.generate(prompt)
    return {'status': 'success', 'classification': result}
