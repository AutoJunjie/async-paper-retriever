import React, { useState, useEffect } from 'react';
import { Search, Plus, Clock, Download, Filter, Eye, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Calendar, BarChart3 } from 'lucide-react';
import { SearchTask, SearchResult } from '../types';
import { apiService } from '../services/api';

const MedicalPaperDashboard = () => {
  const [tasks, setTasks] = useState<SearchTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<SearchTask | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [resultsPerPage] = useState(10);
  const [newKeyword, setNewKeyword] = useState("");
  const [searchType, setSearchType] = useState<'keyword' | 'hybrid'>('hybrid');
  const [maxResults, setMaxResults] = useState(100);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  const statusConfig = {
    "Pending": { color: "bg-amber-50 text-amber-700 border-amber-200", icon: "⏳", progress: 0, dotColor: "bg-amber-400" },
    "Searching": { color: "bg-blue-50 text-blue-700 border-blue-200", icon: "🔍", progress: 25, dotColor: "bg-blue-400" },
    "Evaluating": { color: "bg-purple-50 text-purple-700 border-purple-200", icon: "⚡", progress: 75, dotColor: "bg-purple-400" },
    "Completed": { color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "✅", progress: 100, dotColor: "bg-emerald-400" }
  };

  // 检查后端健康状态
  useEffect(() => {
    const checkBackendHealth = async () => {
      setBackendStatus('checking');
      const isHealthy = await apiService.checkHealth();
      setBackendStatus(isHealthy ? 'online' : 'offline');
    };

    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // 在组件挂载时加载历史任务
  useEffect(() => {
    const loadSearchHistory = async () => {
      try {
        console.log('正在加载搜索历史...');
        const historyTasks = await apiService.getSearchHistory(50);
        console.log(`加载了 ${historyTasks.length} 个历史任务`);
        setTasks(historyTasks);
        
        // 如果有历史任务且没有选中的任务，自动选中第一个
        if (historyTasks.length > 0 && !selectedTask) {
          setSelectedTask(historyTasks[0]);
        }
      } catch (error) {
        console.error('加载搜索历史失败:', error);
      }
    };

    // 只在后端在线时加载历史
    if (backendStatus === 'online') {
      loadSearchHistory();
    }
  }, [backendStatus]); // 依赖后端状态

  // 监听任务状态更新事件
  useEffect(() => {
    const handleTaskStatusUpdate = (event: CustomEvent) => {
      const { taskId, status } = event.detail;
      setTasks(prev => {
        const updatedTasks = prev.map(task => 
          task.id === taskId ? { ...task, status } : task
        );
        // 更新选中的任务
        if (selectedTask && selectedTask.id === taskId) {
          setSelectedTask({ ...selectedTask, status });
        }
        return updatedTasks;
      });
    };

    const handleTaskResultsUpdate = (event: CustomEvent) => {
      const { taskId, updates } = event.detail;
      setTasks(prev => {
        const updatedTasks = prev.map(task => 
          task.id === taskId ? { ...task, ...updates } : task
        );
        // 更新选中的任务
        if (selectedTask && selectedTask.id === taskId) {
          setSelectedTask({ ...selectedTask, ...updates });
        }
        return updatedTasks;
      });
    };

    window.addEventListener('taskStatusUpdate', handleTaskStatusUpdate as EventListener);
    window.addEventListener('taskResultsUpdate', handleTaskResultsUpdate as EventListener);

    return () => {
      window.removeEventListener('taskStatusUpdate', handleTaskStatusUpdate as EventListener);
      window.removeEventListener('taskResultsUpdate', handleTaskResultsUpdate as EventListener);
    };
  }, [selectedTask]);

  const createNewTask = async () => {
    if (!newKeyword.trim() || isCreatingTask) return;
    
    setIsCreatingTask(true);
    try {
      const newTask = await apiService.createSearchTask(newKeyword, {
        searchType,
        maxResults
      });
      setTasks([newTask, ...tasks]);
      setSelectedTask(newTask); // 自动选中新创建的任务
      setNewKeyword("");
      setSearchType('hybrid');
      setMaxResults(100);
      setShowNewTaskModal(false);
      setCurrentPage(1); // 重置分页
    } catch (error) {
      console.error('Failed to create task:', error);
    } finally {
      setIsCreatingTask(false);
    }
  };

  const filteredTasks = filterStatus === "All" 
    ? tasks 
    : tasks.filter(task => task.status === filterStatus);

  // 分页逻辑
  const totalPages = selectedTask && selectedTask.results 
    ? Math.ceil(selectedTask.results.length / resultsPerPage) 
    : 0;
  
  const currentResults = selectedTask && selectedTask.results
    ? selectedTask.results.slice(
        (currentPage - 1) * resultsPerPage,
        currentPage * resultsPerPage
      )
    : [];

  const handleTaskSelect = async (task: SearchTask) => {
    setSelectedTask(task);
    setCurrentPage(1); // 重置分页
    
    // 如果任务没有结果，尝试懒加载
    if (task.results.length === 0 && task.status === 'Completed') {
      try {
        console.log(`懒加载任务 "${task.keyword}" 的详细结果...`);
        const taskWithResults = await apiService.loadTaskResults(task);
        
        // 更新tasks列表中的任务
        setTasks(prevTasks => 
          prevTasks.map(t => t.id === task.id ? taskWithResults : t)
        );
        
        // 更新选中的任务
        setSelectedTask(taskWithResults);
      } catch (error) {
        console.error('懒加载任务结果失败:', error);
      }
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm shadow-sm border-b border-slate-200/60">
        <div className="max-w-full mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Medical Paper Retrieval Dashboard</h1>
              <p className="text-slate-600 mt-1">医疗论文检索任务管理中心</p>
            </div>
            <div className="flex items-center gap-6">
              {/* 后端状态指示器 */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50">
                {backendStatus === 'checking' && (
                  <>
                    <Clock size={16} className="text-slate-500 animate-spin" />
                    <span className="text-sm text-slate-600">检查连接中...</span>
                  </>
                )}
                {backendStatus === 'online' && (
                  <>
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-sm text-emerald-600 font-medium">后端在线</span>
                  </>
                )}
                {backendStatus === 'offline' && (
                  <>
                    <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                    <span className="text-sm text-red-600 font-medium">后端离线</span>
                  </>
                )}
              </div>

              <button
                onClick={() => setShowNewTaskModal(true)}
                disabled={backendStatus === 'offline'}
                className={`px-6 py-3 rounded-xl font-medium flex items-center gap-3 transition-all duration-200 shadow-lg ${
                  backendStatus === 'offline' 
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' 
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 hover:shadow-xl transform hover:-translate-y-0.5'
                }`}
              >
                <Plus size={20} />
                New Search Task
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Task List */}
        <div className="w-96 bg-white/60 backdrop-blur-sm border-r border-slate-200/60 flex flex-col">
          {/* Filter Bar */}
          <div className="p-6 border-b border-slate-200/60">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-slate-600">
                <Filter size={18} />
                <span className="font-medium">Filter</span>
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="flex-1 border border-slate-200 rounded-lg px-4 py-2 text-sm bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
              >
                <option value="All">All Tasks</option>
                <option value="Pending">Pending</option>
                <option value="Searching">Searching</option>
                <option value="Evaluating">Evaluating</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div className="mt-3 text-sm text-slate-500">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} found
            </div>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-16">
                <div className="mx-auto w-24 h-24 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-2xl flex items-center justify-center mb-6">
                  <Search size={32} className="text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No search tasks</h3>
                <p className="text-slate-600 mb-8">Create your first medical paper search task to get started.</p>
                <button
                  onClick={() => setShowNewTaskModal(true)}
                  disabled={backendStatus === 'offline'}
                  className={`px-6 py-3 rounded-xl font-medium flex items-center gap-3 mx-auto transition-all duration-200 ${
                    backendStatus === 'offline' 
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                  }`}
                >
                  <Plus size={18} />
                  Create First Task
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleTaskSelect(task)}
                    className={`p-5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      selectedTask?.id === task.id
                        ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg transform scale-105'
                        : 'border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white hover:shadow-md'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 mb-2 leading-snug">{task.keyword}</h3>
                        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                          <Calendar size={14} />
                          <span>{task.createdAt}</span>
                        </div>
                        {task.totalResults && (
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <BarChart3 size={14} />
                            <span className="font-medium">{task.totalResults.toLocaleString()}</span>
                            <span>results</span>
                          </div>
                        )}
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${statusConfig[task.status].color}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${statusConfig[task.status].dotColor}`}></div>
                          {task.status}
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${statusConfig[task.status].progress}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Task Details */}
        <div className="flex-1 flex flex-col bg-slate-50/50">
          {selectedTask ? (
            <>
              {/* Task Header */}
              <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-slate-900 mb-3">{selectedTask.keyword}</h2>
                    <div className="flex items-center gap-2 text-slate-600 mb-4">
                      <Calendar size={16} />
                      <span>Created: {selectedTask.createdAt}</span>
                    </div>
                    {selectedTask.totalResults && (
                      <div className="flex gap-8 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                          <span className="text-slate-600">Total:</span>
                          <span className="font-semibold text-slate-900">{selectedTask.totalResults.toLocaleString()}</span>
                        </div>
                        {selectedTask.relevantResults && (
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                            <span className="text-slate-600">Relevant:</span>
                            <span className="font-semibold text-emerald-600">{selectedTask.relevantResults.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`px-4 py-2 rounded-xl text-sm font-semibold border ${statusConfig[selectedTask.status].color}`}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${statusConfig[selectedTask.status].dotColor}`}></div>
                      {selectedTask.status}
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${statusConfig[selectedTask.status].progress}%` }}
                  ></div>
                </div>
              </div>

              {/* Search Results */}
              {selectedTask.results.length > 0 ? (
                <>
                  {/* Results Header */}
                  <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200/60 px-8 py-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-semibold text-slate-900">
                        Search Results <span className="text-slate-500 font-normal">({selectedTask.results.length} total)</span>
                      </h3>
                      <div className="flex gap-3">
                        <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-sm hover:shadow-md">
                          Export All
                        </button>
                        <button className="px-4 py-2 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-lg text-sm font-medium hover:from-slate-700 hover:to-slate-800 transition-all duration-200 shadow-sm hover:shadow-md">
                          Filter Relevant
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Results List */}
                  <div className="flex-1 overflow-y-auto p-8">
                    <div className="space-y-6">
                      {currentResults.map((result, index) => (
                        <div key={result.id} className="bg-white/90 backdrop-blur-sm rounded-2xl p-8 border border-slate-200/60 hover:border-slate-300/60 transition-all duration-200 shadow-sm hover:shadow-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                                  {(currentPage - 1) * resultsPerPage + index + 1}
                                </div>
                                <h4 className="font-semibold text-slate-900 text-lg leading-snug">{result.title}</h4>
                              </div>
                              <p className="text-sm text-slate-600 mb-4 flex items-center gap-2">
                                <span className="font-medium">{result.authors}</span>
                                <span className="text-slate-400">•</span>
                                <span className="text-blue-600 font-medium">{result.journal}</span>
                                <span className="text-slate-400">•</span>
                                <span>{result.year}</span>
                              </p>
                              <p className="text-sm text-slate-700 mb-6 leading-relaxed">{result.abstract}</p>
                              
                              {/* AI Reasoning Section */}
                              <div className={`p-4 rounded-xl border-l-4 ${
                                result.relevanceScore >= 0.8 
                                  ? 'bg-emerald-50 border-emerald-400' 
                                  : result.relevanceScore >= 0.6 
                                    ? 'bg-amber-50 border-amber-400' 
                                    : 'bg-red-50 border-red-400'
                              }`}>
                                <div className="flex items-start gap-3">
                                  <div className="text-xs font-semibold text-slate-600 mt-1">AI Assessment:</div>
                                  <p className={`text-sm font-medium ${
                                    result.relevanceScore >= 0.8 
                                      ? 'text-emerald-700' 
                                      : result.relevanceScore >= 0.6 
                                        ? 'text-amber-700' 
                                        : 'text-red-700'
                                  }`}>
                                    {result.aiReasoning}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="ml-8 text-right flex-shrink-0">
                              <div className={`text-2xl font-bold mb-4 ${
                                result.relevanceScore >= 0.8 
                                  ? 'text-emerald-600' 
                                  : result.relevanceScore >= 0.6 
                                    ? 'text-amber-600' 
                                    : 'text-red-600'
                              }`}>
                                {(result.relevanceScore * 100).toFixed(1)}%
                              </div>
                              <div className="flex gap-3">
                                <button className="p-3 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                  <Eye size={18} />
                                </button>
                                <button className="p-3 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                  <Download size={18} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="bg-white/80 backdrop-blur-sm border-t border-slate-200/60 px-8 py-6">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-slate-600">
                          Showing <span className="font-semibold">{(currentPage - 1) * resultsPerPage + 1}</span> to <span className="font-semibold">{Math.min(currentPage * resultsPerPage, selectedTask.results.length)}</span> of <span className="font-semibold">{selectedTask.results.length}</span> results
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="p-2 border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          
                          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                            let page;
                            if (totalPages <= 7) {
                              page = i + 1;
                            } else if (currentPage <= 4) {
                              page = i + 1;
                            } else if (currentPage >= totalPages - 3) {
                              page = totalPages - 6 + i;
                            } else {
                              page = currentPage - 3 + i;
                            }
                            
                            return (
                              <button
                                key={page}
                                onClick={() => handlePageChange(page)}
                                className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${
                                  currentPage === page
                                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 shadow-md'
                                    : 'border-slate-300 hover:bg-slate-50'
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}
                          
                          <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="p-2 border border-slate-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto w-32 h-32 bg-gradient-to-br from-slate-100 to-slate-200 rounded-3xl flex items-center justify-center mb-8">
                      <Search size={48} className="text-slate-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900 mb-3">
                      {selectedTask.status === 'Completed' ? 'No results found' : 'Search in progress...'}
                    </h3>
                    <p className="text-slate-600 max-w-md mx-auto">
                      {selectedTask.status === 'Completed' 
                        ? 'Try adjusting your search terms or filters to find more relevant papers.' 
                        : 'Please wait while we search for relevant medical papers. This may take a few moments.'}
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="mx-auto w-32 h-32 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-3xl flex items-center justify-center mb-8">
                  <Search size={48} className="text-blue-500" />
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-3">Select a search task</h3>
                <p className="text-slate-600 max-w-md mx-auto">Choose a task from the left panel to view its details and results. You can also create a new search task to get started.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Task Modal - keeping the same enhanced modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-6">Create New Search Task</h3>
            
            <div className="space-y-4">
              {/* 搜索关键词 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Keywords <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="Enter medical keywords..."
                  className="w-full border rounded-lg px-3 py-2 bg-white text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && createNewTask()}
                  disabled={isCreatingTask}
                />
              </div>

              {/* 搜索方式 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSearchType('keyword')}
                    className={`p-3 border rounded-lg text-sm font-medium transition-colors ${
                      searchType === 'keyword'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    disabled={isCreatingTask}
                  >
                    <div className="font-semibold">Keyword Search</div>
                    <div className="text-xs text-gray-500 mt-1">Fast, exact match</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchType('hybrid')}
                    className={`p-3 border rounded-lg text-sm font-medium transition-colors ${
                      searchType === 'hybrid'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    disabled={isCreatingTask}
                  >
                    <div className="font-semibold">Hybrid Search</div>
                    <div className="text-xs text-gray-500 mt-1">AI-powered, semantic</div>
                  </button>
                </div>
              </div>

              {/* 最大召回数量 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Maximum Results
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="10000"
                    step="1"
                    value={maxResults}
                    onChange={(e) => setMaxResults(parseInt(e.target.value))}
                    className="flex-1"
                    disabled={isCreatingTask}
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={maxResults}
                      onChange={(e) => setMaxResults(Math.min(10000, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="w-20 border rounded px-2 py-1 text-sm text-center bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isCreatingTask}
                    />
                    <span className="text-sm text-gray-500">results</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>10,000</span>
                </div>
              </div>

              {/* 搜索说明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-sm text-blue-800">
                  <div className="font-medium mb-1">Search Options:</div>
                  <ul className="text-xs space-y-1">
                    <li><strong>Keyword Search:</strong> Fast exact matching for specific terms</li>
                    <li><strong>Hybrid Search:</strong> Combines keyword + AI semantic understanding</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowNewTaskModal(false);
                  setNewKeyword("");
                  setSearchType('hybrid');
                  setMaxResults(100);
                }}
                disabled={isCreatingTask}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={createNewTask}
                disabled={isCreatingTask || !newKeyword.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isCreatingTask && <Clock size={16} className="animate-spin" />}
                {isCreatingTask ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MedicalPaperDashboard; 