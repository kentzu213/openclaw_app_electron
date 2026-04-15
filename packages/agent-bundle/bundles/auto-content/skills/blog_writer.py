"""
Blog Writer Skill — Viết blog SEO-optimized từ keyword hoặc outline.
"""

import json
from datetime import datetime


async def execute(context, params=None):
    """
    Generate a complete SEO blog post.
    
    Args:
        params:
            - keyword: Target SEO keyword
            - outline: Optional article outline
            - word_count: Target word count (default: 1500)
            - language: 'vi' | 'en' (default from config)
    """
    config = context.config
    keyword = (params or {}).get('keyword', '')
    outline = (params or {}).get('outline', '')
    word_count = (params or {}).get('word_count', 1500)
    language = (params or {}).get('language', config.get('default_language', 'vi'))
    brand = config.get('brand_name', '')
    style = config.get('writing_style', 'Thân thiện')
    
    if not keyword and not outline:
        return {'status': 'error', 'message': 'Cần keyword hoặc outline'}
    
    # 1. Generate outline if not provided
    if not outline:
        outline = await _generate_outline(context, keyword, language)
    
    # 2. Generate the full article
    prompt = f"""Viết một bài blog hoàn chỉnh:

**Keyword chính**: {keyword}
**Outline**: 
{outline}

**Yêu cầu**:
- Ngôn ngữ: {'Tiếng Việt' if language == 'vi' else 'English'}
- Phong cách: {style}
- Thương hiệu: {brand}
- Khoảng {word_count} từ
- SEO: keyword xuất hiện trong title, H2, intro, conclusion
- Có meta description (dưới 160 ký tự)
- Có internal/external link suggestions
- Format Markdown với H1, H2, H3
- Hook mạnh ở mở bài
- CTA rõ ràng ở kết bài

Trả lời theo format:
---
title: ...
meta_description: ...
keywords: [keyword1, keyword2, ...]
---

[nội dung bài viết]"""

    article = await context.llm.generate(prompt)
    
    # 3. SEO score check
    seo_score = await _check_seo(context, article, keyword)
    
    # 4. Save to memory
    await context.memory.add({
        'type': 'blog_post',
        'keyword': keyword,
        'title': _extract_title(article),
        'word_count': len(article.split()),
        'seo_score': seo_score.get('score', 0),
        'status': 'draft',
        'created_at': datetime.now().isoformat(),
    })
    
    return {
        'status': 'success',
        'article': article,
        'seo_score': seo_score,
        'word_count': len(article.split()),
    }


async def _generate_outline(context, keyword, language):
    """Generate article outline from keyword."""
    lang_text = 'Tiếng Việt' if language == 'vi' else 'English'
    prompt = f"""Tạo outline chi tiết cho bài blog về: "{keyword}"
Ngôn ngữ: {lang_text}

Format:
H1: [title]
  H2: [section 1]
    - point 1
    - point 2
  H2: [section 2]
    ...
  H2: Kết luận"""

    return await context.llm.generate(prompt)


async def _check_seo(context, article, keyword):
    """Analyze SEO score of the article."""
    prompt = f"""Đánh giá SEO cho bài viết (keyword: "{keyword}"):
{article[:2000]}...

Trả lời JSON:
{{
  "score": 0-100,
  "keyword_density": "X%",
  "title_has_keyword": true/false,
  "meta_description_ok": true/false,
  "headings_optimized": true/false,
  "suggestions": ["..."]
}}"""

    result = await context.llm.generate(prompt)
    try:
        return json.loads(result)
    except json.JSONDecodeError:
        return {'score': 70, 'suggestions': ['Unable to parse SEO check']}


def _extract_title(article):
    """Extract title from markdown article."""
    for line in article.split('\n'):
        line = line.strip()
        if line.startswith('# ') or line.startswith('title:'):
            return line.replace('# ', '').replace('title:', '').strip()
    return 'Untitled'
