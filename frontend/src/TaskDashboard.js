import React, { useState, useEffect } from 'react';
import './TaskDashboard.css';

const TaskDashboard = () => {
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: '', type: '' });
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 获取任务列表
  const fetchTasks = async () => {
    try {
      const params = new URLSearchParams();
      if (filter.status) params.append('status', filter.status);
      if (filter.type) params.append('task_type', filter.type);
      params.append('limit', '100');

      const response = await fetch(`/tasks?${params}`);
      const data = await response.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error('获取任务列表失败:', error);
    }
  };

  // 获取任务统计
  const fetchStats = async () => {
    try {
      const response = await fetch('/tasks/stats');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('获取任务统计失败:', error);
    }
  };

  // 取消任务
  const cancelTask = async (taskId) => {
    try {
      const response = await fetch(`/tasks/${taskId}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (response.ok) {
        fetchTasks();
        alert('任务已取消');
      } else {
        alert(data.error || '取消任务失败');
      }
    } catch (error) {
      console.error('取消任务失败:', error);
      alert('取消任务失败');
    }
  };

  // 清理已完成任务
  const clearCompletedTasks = async () => {
    try {
      const response = await fetch('/tasks/completed', {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchTasks();
        fetchStats();
        alert('已清理完成的任务');
      }
    } catch (error) {
      console.error('清理任务失败:', error);
    }
  };

  // 格式化时间
  const formatTime = (isoString) => {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN');
  };

  // 计算任务持续时间
  const calculateDuration = (task) => {
    if (!task.started_at) return '-';
    
    const start = new Date(task.started_at);
    const end = task.completed_at ? new Date(task.completed_at) : new Date();
    const duration = Math.round((end - start) / 1000);
    
    if (duration < 60) return `${duration}秒`;
    if (duration < 3600) return `${Math.round(duration / 60)}分钟`;
    return `${Math.round(duration / 3600)}小时`;
  };

  // 获取状态颜色
  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ffa500';
      case 'running': return '#007bff';
      case 'completed': return '#28a745';
      case 'failed': return '#dc3545';
      case 'cancelled': return '#6c757d';
      default: return '#6c757d';
    }
  };

  // 获取状态文本
  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return '等待中';
      case 'running': return '运行中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      case 'cancelled': return '已取消';
      default: return status;
    }
  };

  // 获取任务类型文本
  const getTypeText = (type) => {
    switch (type) {
      case 'search': return '搜索';
      case 'llm_evaluation': return 'LLM评估';
      case 'cache_operation': return '缓存操作';
      default: return type;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchTasks(), fetchStats()]);
      setLoading(false);
    };

    loadData();
  }, [filter]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchTasks();
      fetchStats();
    }, 2000); // 每2秒刷新一次

    return () => clearInterval(interval);
  }, [autoRefresh, filter]);

  if (loading) {
    return (
      <div className="task-dashboard">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="task-dashboard">
      <div className="dashboard-header">
        <h2>任务仪表板</h2>
        <div className="header-controls">
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            自动刷新
          </label>
          <button onClick={clearCompletedTasks} className="btn btn-secondary">
            清理已完成任务
          </button>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>总任务数</h3>
          <div className="stat-value">{stats.total || 0}</div>
        </div>
        <div className="stat-card">
          <h3>运行中</h3>
          <div className="stat-value running">{stats.running_count || 0}</div>
        </div>
        <div className="stat-card">
          <h3>今日完成</h3>
          <div className="stat-value completed">{stats.completed_today || 0}</div>
        </div>
        <div className="stat-card">
          <h3>今日失败</h3>
          <div className="stat-value failed">{stats.failed_today || 0}</div>
        </div>
      </div>

      {/* 过滤器 */}
      <div className="filters">
        <select
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value })}
        >
          <option value="">所有状态</option>
          <option value="pending">等待中</option>
          <option value="running">运行中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
        </select>

        <select
          value={filter.type}
          onChange={(e) => setFilter({ ...filter, type: e.target.value })}
        >
          <option value="">所有类型</option>
          <option value="search">搜索</option>
          <option value="llm_evaluation">LLM评估</option>
          <option value="cache_operation">缓存操作</option>
        </select>
      </div>

      {/* 任务列表 */}
      <div className="tasks-container">
        {tasks.length === 0 ? (
          <div className="no-tasks">暂无任务</div>
        ) : (
          <div className="tasks-table">
            <div className="table-header">
              <div>任务ID</div>
              <div>类型</div>
              <div>标题</div>
              <div>状态</div>
              <div>进度</div>
              <div>创建时间</div>
              <div>持续时间</div>
              <div>操作</div>
            </div>
            {tasks.map((task) => (
              <div key={task.id} className="table-row">
                <div className="task-id" title={task.id}>
                  {task.id.substring(0, 8)}...
                </div>
                <div className="task-type">
                  {getTypeText(task.type)}
                </div>
                <div className="task-title" title={task.description}>
                  {task.title}
                </div>
                <div className="task-status">
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(task.status) }}
                  >
                    {getStatusText(task.status)}
                  </span>
                </div>
                <div className="task-progress">
                  {task.progress.total > 0 ? (
                    <div className="progress-container">
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${task.progress.percentage}%` }}
                        ></div>
                      </div>
                      <span className="progress-text">
                        {task.progress.current}/{task.progress.total}
                      </span>
                    </div>
                  ) : (
                    <span>-</span>
                  )}
                  {task.progress.message && (
                    <div className="progress-message" title={task.progress.message}>
                      {task.progress.message}
                    </div>
                  )}
                </div>
                <div className="task-time">
                  {formatTime(task.created_at)}
                </div>
                <div className="task-duration">
                  {calculateDuration(task)}
                </div>
                <div className="task-actions">
                  {task.status === 'running' && (
                    <button
                      onClick={() => cancelTask(task.id)}
                      className="btn btn-sm btn-danger"
                    >
                      取消
                    </button>
                  )}
                  {task.error_message && (
                    <span
                      className="error-indicator"
                      title={task.error_message}
                    >
                      ⚠️
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskDashboard; 