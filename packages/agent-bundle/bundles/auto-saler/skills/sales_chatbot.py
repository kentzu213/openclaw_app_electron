"""
Sales Chatbot Skill — Chatbot bán hàng thông minh.
Tư vấn sản phẩm, trả lời FAQ, và hướng dẫn khách chốt đơn.
"""

import json
from datetime import datetime


async def execute(context, params=None):
    """
    Handle incoming customer message and generate sales response.
    """
    message = (params or {}).get('message', '')
    customer_id = (params or {}).get('customer_id', 'unknown')
    platform = (params or {}).get('platform', 'facebook')
    
    # 1. Load customer history
    history = await context.memory.query({
        'type': 'conversation',
        'customer_id': customer_id,
        'limit': 20,
        'sort': '-timestamp',
    })
    
    # 2. Analyze intent
    intent = await _analyze_intent(context, message, history)
    
    # 3. Generate response based on intent
    if intent['type'] == 'product_inquiry':
        response = await _handle_product_inquiry(context, message, intent, history)
    elif intent['type'] == 'pricing':
        response = await _handle_pricing(context, message, intent)
    elif intent['type'] == 'objection':
        response = await _handle_objection(context, message, intent, history)
    elif intent['type'] == 'ready_to_buy':
        response = await _handle_closing(context, message, customer_id)
    elif intent['type'] == 'support':
        response = await _handle_support(context, message)
    else:
        response = await _handle_general(context, message, history)
    
    # 4. Save conversation
    await context.memory.add({
        'type': 'conversation',
        'customer_id': customer_id,
        'platform': platform,
        'message': message,
        'response': response,
        'intent': intent['type'],
        'timestamp': datetime.now().isoformat(),
    })
    
    # 5. Update lead score
    await _update_lead_score(context, customer_id, intent)
    
    return {
        'status': 'success',
        'response': response,
        'intent': intent['type'],
        'customer_id': customer_id,
    }


async def _analyze_intent(context, message, history):
    """Classify customer message intent."""
    history_summary = '\n'.join([
        f"Khách: {h.get('message', '')} → Bot: {h.get('response', '')[:50]}"
        for h in (history or [])[-5:]
    ])
    
    prompt = f"""Phân tích intent tin nhắn khách hàng:
"{message}"

Lịch sử gần đây:
{history_summary}

Trả lời JSON:
{{
  "type": "product_inquiry" | "pricing" | "objection" | "ready_to_buy" | "support" | "greeting" | "other",
  "confidence": 0.0-1.0,
  "product_mentioned": "tên sản phẩm hoặc null",
  "sentiment": "positive" | "negative" | "neutral"
}}"""

    result = await context.llm.generate(prompt)
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {'type': 'other', 'confidence': 0.5, 'sentiment': 'neutral'}


async def _handle_product_inquiry(context, message, intent, history):
    config = context.config
    prompt = f"""Bạn là nhân viên tư vấn bán hàng.
Khách hỏi: "{message}"
Sản phẩm quan tâm: {intent.get('product_mentioned', 'chưa rõ')}

Trả lời tư vấn ngắn gọn (dưới 200 ký tự), thân thiện, kèm 1 câu hỏi để tìm hiểu nhu cầu."""
    return await context.llm.generate(prompt)


async def _handle_pricing(context, message, intent):
    prompt = f"""Khách hỏi về giá: "{message}"
Trả lời giá một cách tự tin, nhấn mạnh giá trị, kèm ưu đãi nếu có. Dưới 150 ký tự."""
    return await context.llm.generate(prompt)


async def _handle_objection(context, message, intent, history):
    prompt = f"""Khách từ chối/phản đối: "{message}"
Sentiment: {intent.get('sentiment')}
Xử lý objection một cách tinh tế, không pushy. Dưới 200 ký tự."""
    return await context.llm.generate(prompt)


async def _handle_closing(context, message, customer_id):
    prompt = f"""Khách sẵn sàng mua: "{message}"
Hướng dẫn chốt đơn ngắn gọn, rõ ràng. Kèm link hoặc hướng dẫn thanh toán."""
    return await context.llm.generate(prompt)


async def _handle_support(context, message):
    prompt = f"""Khách cần hỗ trợ: "{message}"
Trả lời hữu ích, nếu không giải quyết được thì hướng dẫn liên hệ hotline."""
    return await context.llm.generate(prompt)


async def _handle_general(context, message, history):
    prompt = f"""Tin nhắn: "{message}"
Trả lời thân thiện, ngắn gọn, và hướng cuộc trò chuyện về sản phẩm/dịch vụ."""
    return await context.llm.generate(prompt)


async def _update_lead_score(context, customer_id, intent):
    """Update lead scoring based on intent signals."""
    score_map = {
        'ready_to_buy': 10,
        'pricing': 7,
        'product_inquiry': 5,
        'objection': 3,
        'support': 2,
        'greeting': 1,
        'other': 0,
    }
    score_delta = score_map.get(intent['type'], 0)
    
    await context.memory.add({
        'type': 'lead_score_event',
        'customer_id': customer_id,
        'score_delta': score_delta,
        'intent': intent['type'],
        'timestamp': datetime.now().isoformat(),
    })
