import { SearchTask, SearchResult } from '../types';

// API基础配置 - 支持环境变量
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// 后端API请求和响应类型
interface BackendSearchRequest {
  query: string;
  page: number;
  pageSize: number;
  searchType: 'keyword' | 'vector' | 'hybrid';
  enableLlm: boolean;
}

interface BackendSearchResult {
  id: string;
  title: string;
  keywords: string[];
  abstract: string;
  score: number;
  source?: string;
  matched_keywords?: string[];
  relevance_reason?: string;
}

interface BackendSearchResponse {
  total: number;
  results: BackendSearchResult[];
  searchType: string;
  rewrittenTerms?: string[];
  search_id?: string;
}

// 异步搜索响应类型
interface AsyncSearchInitiatedResponse {
  search_id: string;
  message: string;
}

// 搜索历史条目类型
interface SearchHistoryItem {
  search_id: string;
  query: string;
  search_type: string;
  enable_llm: boolean;
  total_results?: number;
  results_count: number;
  timestamp: string;
  created_at: number;
}

// 搜索历史响应类型
interface SearchHistoryResponse {
  history: SearchHistoryItem[];
  count: number;
}

interface TaskCreationResponse {
  task_id: string;
  status: 'Pending';
  message: string;
}

// 创建任务的选项参数
interface CreateTaskOptions {
  searchType?: 'keyword' | 'hybrid';
  maxResults?: number;
}

// API服务类
export class ApiService {
  private baseUrl: string;
  private pollInterval: number = 2000; // 轮询间隔2秒

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // 检查后端健康状态
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // 创建新的异步搜索任务
  async createSearchTask(keyword: string, options: CreateTaskOptions = {}): Promise<SearchTask> {
    try {
      // 生成一个前端任务ID
      const frontendTaskId = Date.now();
      
      // 设置默认值
      const searchType = options.searchType || 'hybrid';
      const maxResults = options.maxResults || 100;
      
      // 创建新任务对象
      const newTask: SearchTask = {
        id: frontendTaskId,
        keyword,
        status: 'Pending',
        createdAt: new Date().toLocaleString(),
        totalResults: null,
        relevantResults: null,
        results: []
      };

      // 启动异步搜索
      this.executeAsyncSearch(newTask, { searchType, maxResults });

      return newTask;
    } catch (error) {
      console.error('Failed to create search task:', error);
      throw error;
    }
  }

  // 执行异步搜索
  private async executeAsyncSearch(task: SearchTask, options: { searchType: string; maxResults: number }): Promise<void> {
    try {
      // 更新状态为Searching
      this.updateTaskStatus(task.id, 'Searching');

      // 调用异步搜索API
      const asyncResponse = await this.initiateAsyncSearch({
        query: task.keyword,
        page: 1,
        pageSize: options.maxResults,
        searchType: options.searchType as 'keyword' | 'vector' | 'hybrid',
        enableLlm: true
      });

      console.log(`异步搜索已启动: ${asyncResponse.search_id}`);

      // 开始轮询搜索结果
      this.pollSearchResults(task.id, asyncResponse.search_id);

    } catch (error) {
      console.error('Async search execution failed:', error);
      this.updateTaskStatus(task.id, 'Completed');
    }
  }

  // 启动异步搜索
  private async initiateAsyncSearch(request: BackendSearchRequest): Promise<AsyncSearchInitiatedResponse> {
    const response = await fetch(`${this.baseUrl}/search/async`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Async search failed: ${response.statusText}`);
    }

    return response.json();
  }

  // 轮询搜索结果
  private async pollSearchResults(frontendTaskId: number, backendSearchId: string): Promise<void> {
    const maxPolls = 60; // 最多轮询60次 (2分钟)
    let pollCount = 0;

    const poll = async () => {
      try {
        pollCount++;
        
        // 尝试获取缓存的搜索结果
        const searchResult = await this.getCachedSearch(backendSearchId);
        
        // 如果成功获取到结果，处理并更新前端任务
        if (searchResult && searchResult.results) {
          console.log(`搜索完成，获取到 ${searchResult.results.length} 个结果`);
          
          // 更新状态为Evaluating
          this.updateTaskStatus(frontendTaskId, 'Evaluating');
          
          // 模拟AI评估过程
          await new Promise(resolve => setTimeout(resolve, 1000));

          // 转换结果格式
          const convertedResults = this.convertBackendResults(searchResult.results);
          
          // 更新任务结果
          this.updateTaskResults(frontendTaskId, {
            status: 'Completed',
            totalResults: searchResult.total,
            relevantResults: convertedResults.length,
            results: convertedResults
          });
          
          return; // 完成轮询
        }

      } catch (error) {
        // 如果是404错误，说明结果还没准备好，继续轮询
        if (error instanceof Error && error.message.includes('404')) {
          console.log(`轮询第 ${pollCount} 次，结果尚未准备就绪...`);
        } else {
          console.error('Poll error:', error);
        }
      }

      // 如果还没有超过最大轮询次数，继续轮询
      if (pollCount < maxPolls) {
        setTimeout(poll, this.pollInterval);
      } else {
        console.warn('轮询超时，搜索可能失败');
        this.updateTaskStatus(frontendTaskId, 'Completed');
      }
    };

    // 开始轮询
    setTimeout(poll, this.pollInterval);
  }

  // 执行搜索（保留旧的同步搜索方法作为备用）
  private async executeSearch(task: SearchTask, options: { searchType: string; maxResults: number }): Promise<void> {
    try {
      // 更新状态为Searching
      this.updateTaskStatus(task.id, 'Searching');
      
      // 执行实际搜索
      const searchResponse = await this.performSearch({
        query: task.keyword,
        page: 1,
        pageSize: options.maxResults,
        searchType: options.searchType as 'keyword' | 'vector' | 'hybrid',
        enableLlm: true
      });

      // 更新状态为Evaluating
      this.updateTaskStatus(task.id, 'Evaluating');
      
      // 模拟AI评估过程（延迟一下）
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 转换后端结果为前端格式
      const convertedResults = this.convertBackendResults(searchResponse.results);
      
      // 更新任务结果
      this.updateTaskResults(task.id, {
        status: 'Completed',
        totalResults: searchResponse.total,
        relevantResults: convertedResults.length,
        results: convertedResults
      });

    } catch (error) {
      console.error('Search execution failed:', error);
      // 如果搜索失败，可以设置错误状态或保持原状态
    }
  }

  // 执行搜索请求（同步方式）
  private async performSearch(request: BackendSearchRequest): Promise<BackendSearchResponse> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  // 转换后端结果为前端格式
  private convertBackendResults(backendResults: BackendSearchResult[]): SearchResult[] {
    return backendResults.map((result, index) => ({
      id: index + 1,
      title: result.title,
      authors: this.extractAuthors(result.keywords), // 从keywords中提取作者信息
      journal: this.extractJournal(result.source), // 从source中提取期刊信息
      year: this.extractYear(result.title) || 2024, // 尝试从标题中提取年份
      relevanceScore: result.score,
      abstract: result.abstract,
      aiReasoning: result.relevance_reason || this.generateReasoningFromScore(result.score)
    }));
  }

  // 辅助函数：从keywords中提取作者信息
  private extractAuthors(keywords: string[]): string {
    // 这里可以根据实际数据结构调整
    const authorKeywords = keywords.filter(k => 
      k.includes('author') || k.includes('作者') || /^[A-Z][a-z]+ [A-Z]\.?$/.test(k)
    );
    return authorKeywords.length > 0 
      ? authorKeywords.slice(0, 3).join(', ') 
      : 'Unknown Authors';
  }

  // 辅助函数：从source中提取期刊信息
  private extractJournal(source?: string): string {
    if (!source) return 'Unknown Journal';
    
    // 常见医学期刊的映射
    const journalMap: { [key: string]: string } = {
      'pubmed': 'PubMed Database',
      'medline': 'MEDLINE Database',
      'nejm': 'New England Journal of Medicine',
      'lancet': 'The Lancet',
      'jama': 'JAMA',
      'bmj': 'BMJ'
    };

    const lowerSource = source.toLowerCase();
    for (const [key, journal] of Object.entries(journalMap)) {
      if (lowerSource.includes(key)) {
        return journal;
      }
    }

    return source;
  }

  // 辅助函数：从标题中提取年份
  private extractYear(title: string): number | null {
    const yearMatch = title.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : null;
  }

  // 辅助函数：根据分数生成AI推理
  private generateReasoningFromScore(score: number): string {
    if (score >= 0.8) {
      return "High relevance: Directly addresses the search topic with robust methodology";
    } else if (score >= 0.6) {
      return "Moderate relevance: Related to the topic but may focus on specific aspects";
    } else {
      return "Low relevance: Mentions the topic but may not be the primary focus";
    }
  }

  // 更新任务状态（这些方法需要与前端状态管理集成）
  private updateTaskStatus(taskId: number, status: SearchTask['status']): void {
    // 这里需要与前端的状态管理系统集成
    // 可以通过事件系统或状态管理库来实现
    window.dispatchEvent(new CustomEvent('taskStatusUpdate', {
      detail: { taskId, status }
    }));
  }

  private updateTaskResults(taskId: number, updates: Partial<SearchTask>): void {
    window.dispatchEvent(new CustomEvent('taskResultsUpdate', {
      detail: { taskId, updates }
    }));
  }

  // 获取缓存的搜索结果
  async getCachedSearch(searchId: string): Promise<BackendSearchResponse> {
    const response = await fetch(`${this.baseUrl}/cache/${searchId}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('404: Search results not ready yet');
      }
      throw new Error(`Failed to get cached search: ${response.statusText}`);
    }

    const data = await response.json();
    
    // 检查是否有错误消息
    if (data.error) {
      throw new Error(`Cache error: ${data.error}`);
    }

    // 如果数据包含完整的搜索结果，转换格式
    if (data.results && Array.isArray(data.results)) {
      return {
        total: data.total_results || data.results.length,
        results: data.results,
        searchType: data.search_type || 'unknown',
        rewrittenTerms: data.rewritten_terms || [],
        search_id: data.search_id
      };
    }

    throw new Error('Invalid search result format');
  }

  // 获取缓存统计
  async getCacheStats(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/cache/stats`);
    
    if (!response.ok) {
      throw new Error(`Failed to get cache stats: ${response.statusText}`);
    }

    return response.json();
  }

  // 获取搜索历史
  async getSearchHistory(limit: number = 50): Promise<SearchTask[]> {
    try {
      const response = await fetch(`${this.baseUrl}/search/history?limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`Failed to get search history: ${response.statusText}`);
      }

      const data: SearchHistoryResponse = await response.json();
      
      if (data.error) {
        throw new Error(`History error: ${data.error}`);
      }

      // 转换历史记录为前端任务格式，但不立即加载完整结果
      const tasks: SearchTask[] = [];
      
      for (const historyItem of data.history) {
        // 从UUID生成数字ID（取前13位数字字符）
        const numericId = parseInt(
          historyItem.search_id.replace(/-/g, '').replace(/[^0-9]/g, '').substring(0, 13)
        ) || Date.now();
        
        const task: SearchTask = {
          id: numericId,
          keyword: historyItem.query,
          status: 'Completed',
          createdAt: new Date(historyItem.created_at * 1000).toLocaleString(),
          totalResults: historyItem.total_results || 0,
          relevantResults: historyItem.results_count,
          results: [] // 暂时不加载完整结果，当用户点击任务时再加载
        };
        
        // 存储后端search_id用于后续获取详细结果
        (task as any).backendSearchId = historyItem.search_id;
        
        tasks.push(task);
      }

      console.log(`成功加载 ${tasks.length} 个历史任务`);
      return tasks;
      
    } catch (error) {
      console.error('Failed to get search history:', error);
      return [];
    }
  }

  // 懒加载任务的详细结果
  async loadTaskResults(task: SearchTask): Promise<SearchTask> {
    try {
      const backendSearchId = (task as any).backendSearchId;
      if (!backendSearchId) {
        console.warn('任务缺少backendSearchId，无法加载详细结果');
        return task;
      }

      // 如果已经有结果，直接返回
      if (task.results && task.results.length > 0) {
        return task;
      }

      console.log(`正在加载任务 "${task.keyword}" 的详细结果...`);
      
      const fullResults = await this.getCachedSearch(backendSearchId);
      const convertedResults = this.convertBackendResults(fullResults.results || []);
      
      // 更新任务的结果
      const updatedTask: SearchTask = {
        ...task,
        results: convertedResults,
        totalResults: fullResults.total,
        relevantResults: convertedResults.length
      };
      
      console.log(`成功加载 ${convertedResults.length} 个搜索结果`);
      return updatedTask;
      
    } catch (error) {
      console.error(`加载任务结果失败:`, error);
      return task; // 返回原任务，即使加载失败
    }
  }
}

// 导出单例实例
export const apiService = new ApiService(); 