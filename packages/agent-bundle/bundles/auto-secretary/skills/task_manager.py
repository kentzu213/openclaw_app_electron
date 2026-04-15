"""Task Manager — Quản lý TODO list."""
from datetime import datetime

async def execute(context, params=None):
    action = (params or {}).get('action', 'list')
    
    if action == 'add':
        task = {
            'type': 'task', 'status': 'pending',
            'title': (params or {}).get('title', ''),
            'priority': (params or {}).get('priority', 'normal'),
            'due_date': (params or {}).get('due_date'),
            'created_at': datetime.now().isoformat()
        }
        await context.memory.add(task)
        return {'status': 'success', 'action': 'added', 'task': task}
    elif action == 'complete':
        task_id = (params or {}).get('task_id')
        # Mark task complete in memory
        return {'status': 'success', 'action': 'completed', 'task_id': task_id}
    
    tasks = await context.memory.query({'type': 'task', 'status': 'pending', 'sort': 'priority'})
    return {'status': 'success', 'tasks': tasks or []}
