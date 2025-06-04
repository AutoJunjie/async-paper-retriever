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

  // 创建新的搜索任务
  async createSearchTask(keyword: string, options: CreateTaskOptions = {}): Promise<SearchTask> {
    try {
      // 生成一个唯一的任务ID
      const taskId = Date.now();
      
      // 设置默认值
      const searchType = options.searchType || 'hybrid';
      const maxResults = options.maxResults || 100;
      
      // 创建新任务对象
      const newTask: SearchTask = {
        id: taskId,
        keyword,
        status: 'Pending',
        createdAt: new Date().toLocaleString(),
        totalResults: null,
        relevantResults: null,
        results: []
      };

      // 异步开始搜索过程，传递搜索参数
      this.executeSearch(newTask, { searchType, maxResults });

      return newTask;
    } catch (error) {
      console.error('Failed to create search task:', error);
      throw error;
    }
  }

  // 执行搜索（模拟异步搜索过程）
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

  // 执行搜索请求
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
      throw new Error(`Failed to get cached search: ${response.statusText}`);
    }

    return response.json();
  }

  // 获取缓存统计
  async getCacheStats(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/cache/stats`);
    
    if (!response.ok) {
      throw new Error(`Failed to get cache stats: ${response.statusText}`);
    }

    return response.json();
  }
}

// 导出单例实例
export const apiService = new ApiService(); 