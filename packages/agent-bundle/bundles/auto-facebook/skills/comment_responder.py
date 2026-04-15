"""
Comment Responder Skill — Tự động trả lời comment trên Facebook Page.
Phân biệt spam, sentiment, và trả lời phù hợp.
"""

import json
from datetime import datetime


async def execute(context, params=None):
    """
    Scan for new comments and generate appropriate responses.
    """
    gateway = context.gateway
    config = context.config
    
    # 1. Fetch unread comments
    comments = await gateway.get_comments(
        platform='facebook',
        status='unread',
        limit=50,
    )
    
    if not comments:
        return {'status': 'no_new_comments', 'processed': 0}
    
    results = []
    
    for comment in comments:
        # 2. Analyze sentiment and intent
        analysis = await _analyze_comment(context, comment)
        
        # 3. Skip spam
        if analysis['is_spam']:
            await gateway.mark_spam(comment['id'])
            results.append({'id': comment['id'], 'action': 'marked_spam'})
            continue
        
        # 4. Handle negative sentiment — escalate if critical
        if analysis['sentiment'] == 'negative' and analysis['severity'] == 'high':
            await context.memory.add({
                'type': 'alert',
                'category': 'negative_comment',
                'comment': comment['text'],
                'severity': 'high',
                'timestamp': datetime.now().isoformat(),
            })
            # Still respond, but carefully
        
        # 5. Generate response
        tone = config.get('tone_of_voice', 'Thân thiện')
        response = await _generate_response(context, comment, analysis, tone)
        
        # 6. Post reply
        await gateway.reply_comment(
            platform='facebook',
            comment_id=comment['id'],
            text=response,
        )
        
        results.append({
            'id': comment['id'],
            'action': 'replied',
            'sentiment': analysis['sentiment'],
        })
    
    return {
        'status': 'success',
        'processed': len(results),
        'results': results,
    }


async def _analyze_comment(context, comment):
    """Analyze comment sentiment, intent, and spam probability."""
    prompt = f"""Phân tích comment Facebook sau:
"{comment['text']}"

Trả lời JSON:
{{
  "sentiment": "positive" | "negative" | "neutral",
  "intent": "question" | "feedback" | "complaint" | "praise" | "spam" | "other",
  "is_spam": true/false,
  "severity": "low" | "medium" | "high",
  "key_topic": "..."
}}"""

    result = await context.llm.generate(prompt)
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {
            'sentiment': 'neutral',
            'intent': 'other',
            'is_spam': False,
            'severity': 'low',
            'key_topic': '',
        }


async def _generate_response(context, comment, analysis, tone):
    """Generate appropriate response based on analysis."""
    prompt = f"""Trả lời comment Facebook:
Comment: "{comment['text']}"
Người dùng: {comment.get('author_name', 'Bạn')}
Sentiment: {analysis['sentiment']}
Intent: {analysis['intent']}

Yêu cầu:
- Giọng điệu: {tone}
- Ngắn gọn (dưới 150 ký tự)
- Gọi tên người dùng
- Nếu là câu hỏi: trả lời hữu ích
- Nếu là lời khen: cảm ơn chân thành
- Nếu là phàn nàn: xin lỗi và hỗ trợ"""

    return await context.llm.generate(prompt)
