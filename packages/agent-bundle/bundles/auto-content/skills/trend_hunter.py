"""Trend Hunter — Tìm trending topics và gợi ý content ideas."""
from datetime import datetime

async def execute(context, params=None):
    industry = context.config.get('industry', 'Tech')
    
    prompt = f"""Tìm 5 xu hướng content nổi bật nhất cho ngành {industry} hiện tại.

Format mỗi trend:
🔥 **Trend**: ...
📊 Mức độ: hot/rising/emerging
💡 Content idea: ...
📱 Nền tảng phù hợp: ..."""
    
    trends = await context.llm.generate(prompt)
    await context.memory.add({
        'type': 'trend_report', 'industry': industry,
        'content': trends, 'timestamp': datetime.now().isoformat()
    })
    return {'status': 'success', 'trends': trends}
