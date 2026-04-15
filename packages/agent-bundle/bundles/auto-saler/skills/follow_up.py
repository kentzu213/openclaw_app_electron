"""
Follow-Up Automation Skill — Tự động gửi tin nhắn follow-up theo sequence.
"""

import json
from datetime import datetime, timedelta


async def execute(context, params=None):
    """
    Check and send follow-up messages based on configured sequences.
    Uses the 3-5-7 follow-up framework by default.
    """
    config = context.config
    gateway = context.gateway
    
    # 1. Get leads needing follow-up
    leads = await context.memory.query({
        'type': 'lead_score_event',
        'sort': '-timestamp',
        'limit': 100,
    })
    
    # Deduplicate by customer_id, get latest score
    customer_scores = {}
    for lead in leads:
        cid = lead.get('customer_id')
        if cid and cid not in customer_scores:
            customer_scores[cid] = lead
    
    results = []
    now = datetime.now()
    
    for customer_id, lead_data in customer_scores.items():
        # 2. Check last contact time
        last_contact = await context.memory.query({
            'type': 'follow_up_sent',
            'customer_id': customer_id,
            'sort': '-timestamp',
            'limit': 1,
        })
        
        if last_contact:
            last_time = datetime.fromisoformat(last_contact[0]['timestamp'])
            days_since = (now - last_time).days
        else:
            # Check last conversation
            last_conv = await context.memory.query({
                'type': 'conversation',
                'customer_id': customer_id,
                'sort': '-timestamp',
                'limit': 1,
            })
            if not last_conv:
                continue
            last_time = datetime.fromisoformat(last_conv[0]['timestamp'])
            days_since = (now - last_time).days
        
        # 3. Determine follow-up stage (3-5-7 framework)
        follow_up_count = len(await context.memory.query({
            'type': 'follow_up_sent',
            'customer_id': customer_id,
        }) or [])
        
        should_follow_up = False
        if follow_up_count == 0 and days_since >= 3:
            should_follow_up = True
            stage = 'first_touch'
        elif follow_up_count == 1 and days_since >= 2:
            should_follow_up = True
            stage = 'second_touch'
        elif follow_up_count == 2 and days_since >= 2:
            should_follow_up = True
            stage = 'final_touch'
        elif follow_up_count >= 3:
            # Max 3 follow-ups, mark as cold
            continue
        
        if not should_follow_up:
            continue
        
        # 4. Generate follow-up message
        message = await _generate_follow_up(context, customer_id, stage, lead_data)
        
        # 5. Send via gateway
        platform = lead_data.get('platform', 'facebook')
        await gateway.send_message(
            platform=platform,
            recipient_id=customer_id,
            text=message,
        )
        
        # 6. Log follow-up
        await context.memory.add({
            'type': 'follow_up_sent',
            'customer_id': customer_id,
            'stage': stage,
            'message': message,
            'follow_up_number': follow_up_count + 1,
            'timestamp': now.isoformat(),
        })
        
        results.append({
            'customer_id': customer_id,
            'stage': stage,
            'status': 'sent',
        })
    
    return {
        'status': 'success',
        'follow_ups_sent': len(results),
        'results': results,
    }


async def _generate_follow_up(context, customer_id, stage, lead_data):
    """Generate contextual follow-up message based on stage."""
    # Get conversation history for context
    history = await context.memory.query({
        'type': 'conversation',
        'customer_id': customer_id,
        'sort': '-timestamp',
        'limit': 5,
    })
    
    history_text = '\n'.join([
        f"- {h.get('message', '')[:80]}" for h in (history or [])
    ])
    
    stage_instructions = {
        'first_touch': 'Nhắc nhẹ nhàng, hỏi thăm, gợi nhắc sản phẩm đã quan tâm.',
        'second_touch': 'Chia sẻ thêm giá trị (case study, ưu đãi), tạo urgency nhẹ.',
        'final_touch': 'Lần cuối cùng, offer đặc biệt, deadline rõ ràng.',
    }
    
    prompt = f"""Viết tin nhắn follow-up cho khách hàng.
Stage: {stage} — {stage_instructions.get(stage, '')}

Lịch sử trò chuyện:
{history_text}

Yêu cầu:
- Ngắn gọn (dưới 150 ký tự)
- Thân thiện, không spam
- Có CTA rõ ràng
- Cho option từ chối lịch sự"""

    return await context.llm.generate(prompt)
