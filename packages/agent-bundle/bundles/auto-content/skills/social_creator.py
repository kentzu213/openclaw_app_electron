"""
Social Media Creator Skill — Tạo content cho đa nền tảng.
Facebook, Instagram, TikTok, LinkedIn.
"""

import json
from datetime import datetime


PLATFORM_SPECS = {
    'facebook': {'max_chars': 5000, 'hashtags': 5, 'emoji': True, 'cta': True},
    'instagram': {'max_chars': 2200, 'hashtags': 30, 'emoji': True, 'cta': True},
    'tiktok': {'max_chars': 300, 'hashtags': 5, 'emoji': True, 'cta': False},
    'linkedin': {'max_chars': 3000, 'hashtags': 3, 'emoji': False, 'cta': True},
}


async def execute(context, params=None):
    """
    Generate platform-optimized social media content.
    """
    config = context.config
    topic = (params or {}).get('topic', '')
    platforms = (params or {}).get('platforms', ['facebook'])
    content_type = (params or {}).get('type', 'post')  # post, story, carousel
    
    if not topic:
        # Get trending topic
        topic = await _get_trending_topic(context)
    
    brand = config.get('brand_name', '')
    style = config.get('writing_style', 'Thân thiện')
    audience = config.get('target_audience', '')
    
    results = {}
    
    for platform in platforms:
        specs = PLATFORM_SPECS.get(platform, PLATFORM_SPECS['facebook'])
        
        prompt = f"""Viết 1 bài đăng {platform} về: "{topic}"

**Thương hiệu**: {brand}
**Đối tượng**: {audience}
**Phong cách**: {style}
**Giới hạn**: {specs['max_chars']} ký tự
**Hashtags**: {specs['hashtags']} hashtags
**Emoji**: {'Có' if specs['emoji'] else 'Hạn chế'}
**CTA**: {'Có' if specs['cta'] else 'Không cần'}

Yêu cầu:
- Hook mạnh ở câu đầu
- Ngắn gọn, phù hợp {platform}
- Tối ưu cho engagement
- Viết tiếng Việt"""

        content = await context.llm.generate(prompt)
        
        results[platform] = {
            'content': content,
            'char_count': len(content),
            'platform': platform,
        }
    
    # Save to memory
    await context.memory.add({
        'type': 'social_content',
        'topic': topic,
        'platforms': platforms,
        'content_type': content_type,
        'results': results,
        'created_at': datetime.now().isoformat(),
    })
    
    return {
        'status': 'success',
        'topic': topic,
        'posts': results,
    }


async def _get_trending_topic(context):
    """Suggest a trending topic based on industry."""
    config = context.config
    industry = config.get('industry', 'Tech')
    
    prompt = f"""Gợi ý 1 chủ đề trending cho ngành {industry} để viết social media post.
Trả lời ngắn gọn, chỉ 1 chủ đề."""

    return await context.llm.generate(prompt)
