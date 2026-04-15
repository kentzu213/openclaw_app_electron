"""Travel Planner — Lên kế hoạch di chuyển."""
async def execute(context, params=None):
    destination = (params or {}).get('destination', '')
    dates = (params or {}).get('dates', '')
    budget = (params or {}).get('budget', '')
    
    prompt = f"""Lên kế hoạch di chuyển:
Điểm đến: {destination}
Ngày: {dates}
Ngân sách: {budget}

Format: Lịch trình → Di chuyển → Khách sạn → Chi phí dự kiến"""
    
    plan = await context.llm.generate(prompt)
    return {'status': 'success', 'plan': plan}
