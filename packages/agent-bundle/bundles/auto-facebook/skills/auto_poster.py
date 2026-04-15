"""
Auto Poster Skill — Tự động đăng bài lên Facebook Page.
Hỗ trợ text, ảnh, video, và link share.
"""

import json
from datetime import datetime


async def execute(context, params=None):
    """
    Main entry point for the Auto Poster skill.
    
    Args:
        context: Hermes skill context with access to:
            - context.memory: Agent memory store
            - context.gateway: Platform gateway (Facebook API)
            - context.config: Agent configuration
            - context.llm: LLM interface for content generation
        params: Optional parameters:
            - topic: Content topic (auto-generated if not provided)
            - post_type: 'text' | 'image' | 'video' | 'link'
            - scheduled_time: ISO datetime for scheduled posting
    """
    config = context.config
    gateway = context.gateway
    
    # 1. Determine content topic
    topic = (params or {}).get('topic')
    if not topic:
        # Use content calendar or generate from trending topics
        topic = await _get_next_topic(context)
    
    # 2. Generate content using LLM
    tone = config.get('tone_of_voice', 'Thân thiện')
    post_type = (params or {}).get('post_type', 'text')
    
    prompt = f"""Viết một bài đăng Facebook về chủ đề: {topic}
    
Yêu cầu:
- Giọng điệu: {tone}
- Ngắn gọn, thu hút (dưới 300 ký tự)
- Có call-to-action
- Thêm 3-5 emoji phù hợp
- Không quá promotional"""

    content = await context.llm.generate(prompt)
    
    # 3. Add hashtags
    hashtags = await _generate_hashtags(context, topic)
    full_content = f"{content}\n\n{hashtags}"
    
    # 4. Check content safety
    safety_check = await _check_content_safety(context, full_content)
    if not safety_check['safe']:
        return {
            'status': 'blocked',
            'reason': safety_check['reason'],
            'content': full_content,
        }
    
    # 5. Post to Facebook
    scheduled_time = (params or {}).get('scheduled_time')
    
    if scheduled_time:
        result = await gateway.schedule_post(
            platform='facebook',
            content=full_content,
            scheduled_time=scheduled_time,
        )
    else:
        result = await gateway.post(
            platform='facebook',
            content=full_content,
        )
    
    # 6. Log to memory
    await context.memory.add({
        'type': 'post',
        'topic': topic,
        'content': full_content,
        'post_id': result.get('post_id'),
        'posted_at': datetime.now().isoformat(),
        'status': 'published',
    })
    
    return {
        'status': 'success',
        'post_id': result.get('post_id'),
        'content': full_content,
        'topic': topic,
    }


async def _get_next_topic(context):
    """Get next content topic from calendar or generate one."""
    recent_posts = await context.memory.query({
        'type': 'post',
        'limit': 10,
        'sort': '-posted_at',
    })
    
    recent_topics = [p.get('topic', '') for p in recent_posts]
    
    prompt = f"""Gợi ý 1 chủ đề content Facebook mới.
Các chủ đề gần đây (TRÁNH LẶP): {', '.join(recent_topics[-5:])}
Trả lời ngắn gọn, chỉ 1 chủ đề."""

    return await context.llm.generate(prompt)


async def _generate_hashtags(context, topic):
    """Generate optimized hashtags for the topic."""
    prompt = f"""Tạo 5-7 hashtag tiếng Việt phù hợp cho bài viết về: {topic}
Format: #hashtag1 #hashtag2 ..."""
    
    return await context.llm.generate(prompt)


async def _check_content_safety(context, content):
    """Check content for brand safety violations."""
    prompt = f"""Kiểm tra nội dung sau có an toàn để đăng trên Facebook không:
"{content}"

Trả lời JSON: {{"safe": true/false, "reason": "..."}}"""

    result = await context.llm.generate(prompt)
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {'safe': True, 'reason': 'Unable to parse safety check'}
