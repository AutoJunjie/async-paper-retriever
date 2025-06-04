import React, { useState, useEffect } from 'react';
import { 
  Container, 
  TextField, 
  Button, 
  Card, 
  CardContent, 
  Typography, 
  Box,
  CircularProgress,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip
} from '@mui/material';
import axios from 'axios';

function App() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('keyword');
  const [results, setResults] = useState([]);
  const [allResults, setAllResults] = useState([]); // 存储所有搜索结果
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(500);
  const [total, setTotal] = useState(0);
  const [rewrittenTerms, setRewrittenTerms] = useState([]);
  const [customPageSizeDialogOpen, setCustomPageSizeDialogOpen] = useState(false);
  const [customPageSizeInput, setCustomPageSizeInput] = useState('');
  const [searchTime, setSearchTime] = useState(null);
  const [enableLlm, setEnableLlm] = useState(false);
  const [cacheKey, setCacheKey] = useState(''); // 当前搜索的缓存键

  // 生成缓存键
  const generateCacheKey = (query, searchType, enableLlm) => {
    return `search_${query}_${searchType}_${enableLlm}`;
  };

  // 从localStorage加载缓存的搜索结果
  const loadCachedResults = (key) => {
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const data = JSON.parse(cached);
        // 检查缓存是否过期（24小时）
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data;
        } else {
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('加载缓存失败:', error);
    }
    return null;
  };

  // 保存搜索结果到localStorage
  const saveCachedResults = (key, results, total, rewrittenTerms, searchTime) => {
    try {
      const data = {
        results,
        total,
        rewrittenTerms,
        searchTime,
        timestamp: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('保存缓存失败:', error);
      // 如果存储空间不足，清理旧缓存
      clearOldCache();
    }
  };

  // 清理旧缓存
  const clearOldCache = () => {
    try {
      const keys = Object.keys(localStorage);
      const searchKeys = keys.filter(key => key.startsWith('search_'));
      
      // 按时间戳排序，删除最旧的缓存
      const cacheData = searchKeys.map(key => {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          return { key, timestamp: data.timestamp || 0 };
        } catch {
          return { key, timestamp: 0 };
        }
      }).sort((a, b) => a.timestamp - b.timestamp);

      // 删除一半的旧缓存
      const toDelete = cacheData.slice(0, Math.floor(cacheData.length / 2));
      toDelete.forEach(item => localStorage.removeItem(item.key));
    } catch (error) {
      console.error('清理缓存失败:', error);
    }
  };

  // 本地分页函数
  const paginateResults = (allResults, page, pageSize) => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allResults.slice(startIndex, endIndex);
  };

  // 处理搜索
  const handleSearch = async (newPage = 1, forceRefresh = false) => {
    if (!query.trim()) return;
    
    const key = generateCacheKey(query, searchType, enableLlm);
    
    // 如果是新搜索或强制刷新，清空当前结果并重新搜索
    if (newPage === 1 || forceRefresh) {
      setCacheKey(key);
      
      // 尝试从缓存加载
      if (!forceRefresh) {
        const cached = loadCachedResults(key);
        if (cached) {
          setAllResults(cached.results);
          setTotal(cached.total);
          setRewrittenTerms(cached.rewrittenTerms || []);
          setSearchTime(cached.searchTime);
          setPage(1);
          setResults(paginateResults(cached.results, 1, pageSize));
          return;
        }
      }
      
      // 从API获取所有结果
      setLoading(true);
      const startTime = Date.now();
      try {
        // 请求大量结果（1万条）来获取完整数据集
        const response = await axios.post(`http://localhost:8000/search`, {
          query: query,
          page: 1,
          pageSize: 10000, // 获取更多结果用于本地缓存
          searchType: searchType,
          enableLlm: enableLlm
        });
        
        const searchTimeValue = (Date.now() - startTime) / 1000;
        
        setAllResults(response.data.results);
        setTotal(response.data.total);
        setRewrittenTerms(response.data.rewrittenTerms || []);
        setSearchTime(searchTimeValue);
        setPage(1);
        
        // 保存到缓存
        saveCachedResults(key, response.data.results, response.data.total, response.data.rewrittenTerms, searchTimeValue);
        
        // 显示第一页结果
        setResults(paginateResults(response.data.results, 1, pageSize));
        
      } catch (error) {
        console.error('搜索出错:', error);
        setSearchTime(null);
      } finally {
        setLoading(false);
      }
    } else {
      // 本地翻页
      setPage(newPage);
      setResults(paginateResults(allResults, newPage, pageSize));
    }
  };

  // 处理翻页（本地翻页）
  const handlePageChange = (event, value) => {
    handleSearch(value);
  };

  // 处理页面大小变化
  const handlePageSizeChange = (event) => {
    const newPageSize = event.target.value;
    if (newPageSize === 'custom') {
      setCustomPageSizeDialogOpen(true);
    } else {
      setPageSize(newPageSize);
      // 重新分页当前结果
      if (allResults.length > 0) {
        setPage(1);
        setResults(paginateResults(allResults, 1, newPageSize));
      }
    }
  };

  // 处理自定义页面大小
  const handleCustomPageSizeSubmit = () => {
    const newSize = parseInt(customPageSizeInput, 10);
    if (!isNaN(newSize) && newSize > 0 && newSize <= 10000) {
      setPageSize(newSize);
      // 重新分页当前结果
      if (allResults.length > 0) {
        setPage(1);
        setResults(paginateResults(allResults, 1, newSize));
      }
    }
    setCustomPageSizeDialogOpen(false);
    setCustomPageSizeInput('');
  };

  // 清除缓存
  const clearCache = () => {
    try {
      const keys = Object.keys(localStorage);
      const searchKeys = keys.filter(key => key.startsWith('search_'));
      searchKeys.forEach(key => localStorage.removeItem(key));
      alert('缓存已清除');
    } catch (error) {
      console.error('清除缓存失败:', error);
    }
  };

  // 强制刷新搜索
  const forceRefresh = () => {
    if (query.trim()) {
      handleSearch(1, true);
    }
  };

  // 当页面大小改变时，重新分页
  useEffect(() => {
    if (allResults.length > 0) {
      setResults(paginateResults(allResults, page, pageSize));
    }
  }, [pageSize, page, allResults]);

  // 当搜索类型或LLM设置改变时，如果有查询词则自动重新搜索
  useEffect(() => {
    if (query.trim() && cacheKey) {
      // 生成新的缓存键，如果与当前不同则重新搜索
      const newKey = generateCacheKey(query, searchType, enableLlm);
      if (newKey !== cacheKey) {
        handleSearch(1);
      }
    }
  }, [searchType, enableLlm]);

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h3" component="h1" gutterBottom align="center">
        医学文献搜索
      </Typography>
      
      <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
        <TextField
          fullWidth
          variant="outlined"
          label="输入搜索关键词"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch(1)}
        />
        <FormControl sx={{ minWidth: 120 }}>
          <InputLabel>搜索方式</InputLabel>
          <Select
            value={searchType}
            label="搜索方式"
            onChange={(e) => setSearchType(e.target.value)}
          >
            <MenuItem value="keyword">关键词搜索</MenuItem>
            <MenuItem value="hybrid">混合搜索</MenuItem>
          </Select>
        </FormControl>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControl component="fieldset">
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={enableLlm}
                onChange={(e) => setEnableLlm(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              <Typography variant="body2" color="text.secondary">
                启用LLM相关性评估
              </Typography>
            </Box>
          </FormControl>
        </Box>
        <Button 
          variant="contained" 
          onClick={() => handleSearch(1)}
          disabled={loading}
          sx={{ minWidth: 120 }}
        >
          {loading ? <CircularProgress size={24} /> : '搜索'}
        </Button>
      </Box>

      {/* 缓存控制按钮 */}
      {results.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
          <Button 
            variant="outlined" 
            size="small" 
            onClick={forceRefresh}
            disabled={loading}
          >
            强制刷新
          </Button>
          <Button 
            variant="outlined" 
            size="small" 
            onClick={clearCache}
            color="warning"
          >
            清除所有缓存
          </Button>
          {cacheKey && (
            <Chip 
              label={`已缓存 (${allResults.length}条结果)`} 
              color="success" 
              size="small" 
            />
          )}
        </Box>
      )}

      {results.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              共找到 {total} 条结果，已缓存 {allResults.length} 条 {searchTime !== null && `(耗时 ${searchTime.toFixed(2)} 秒)`}
            </Typography>
            {rewrittenTerms.length > 0 && (searchType === 'keyword' || searchType === 'hybrid') && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                扩展搜索词: {rewrittenTerms.join('、')}
              </Typography>
            )}
          </Box>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>每页显示</InputLabel>
            <Select
              value={pageSize}
              label="每页显示"
              onChange={handlePageSizeChange}
            >
              <MenuItem value={500}>500</MenuItem>
              <MenuItem value={800}>800</MenuItem>
              <MenuItem value={1000}>1000</MenuItem>
              <MenuItem value={1500}>1500</MenuItem>
              <MenuItem value={2000}>2000</MenuItem>
              <MenuItem value={3000}>3000</MenuItem>
              <MenuItem value="custom">自定义...</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      {results.map((result, index) => (
        <Card key={result.id} sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography 
                variant="h6" 
                sx={{ 
                  minWidth: '40px', 
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: result.score < 0.1 ? 'grey.300' : 'primary.main',
                  color: result.score < 0.1 ? 'text.secondary' : 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {(page - 1) * pageSize + index + 1}
              </Typography>
              <Typography variant="h6" sx={{ flex: 1 }}>
                {result.title}
              </Typography>
              {searchType === 'hybrid' ? (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      px: 1, 
                      py: 0.5, 
                      borderRadius: 1,
                      backgroundColor: 'success.light',
                      color: 'white',
                      fontWeight: 'bold'
                    }}
                  >
                    关键词匹配
                  </Typography>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      px: 1, 
                      py: 0.5, 
                      borderRadius: 1,
                      backgroundColor: 'info.light',
                      color: 'white',
                      fontWeight: 'bold'
                    }}
                  >
                    向量检索
                  </Typography>
                </Box>
              ) : (
                <Typography 
                  variant="caption" 
                  sx={{ 
                    px: 1, 
                    py: 0.5, 
                    borderRadius: 1,
                    backgroundColor: result.source === 'keyword' ? 'success.light' : 'info.light',
                    color: 'white',
                    fontWeight: 'bold'
                  }}
                >
                  {result.source === 'keyword' ? '关键词匹配' : '语义相关'}
                </Typography>
              )}
            </Box>
            <Typography color="text.secondary" gutterBottom>
              关键词: {Array.isArray(result.keywords) ? result.keywords.join('、') : result.keywords.split(/[,，]/).join('、')}
            </Typography>
            {(result.source === 'keyword' || result.source === 'hybrid') && result.matched_keywords && result.matched_keywords.length > 0 && (
              <Typography color="text.secondary" gutterBottom sx={{ color: 'success.main' }}>
                匹配关键词: {result.matched_keywords.join('、')}
              </Typography>
            )}
            <Typography variant="body2" paragraph>
              {result.abstract?.substring(0, 200)}...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              文档ID: {result.id} | 相关度得分: {result.score}
              {result.relevance_reason && (
                <span style={{ marginLeft: '10px', color: 'primary.main' }}>
                  | 相关性原因: {result.relevance_reason}
                </span>
              )}
            </Typography>
          </CardContent>
        </Card>
      ))}

      {results.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination 
            count={Math.ceil(allResults.length / pageSize)} 
            page={page} 
            onChange={handlePageChange}
            color="primary"
          />
        </Box>
      )}

      <Dialog open={customPageSizeDialogOpen} onClose={() => setCustomPageSizeDialogOpen(false)}>
        <DialogTitle>自定义每页显示数量</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="每页显示数量（1-10000）"
            type="number"
            fullWidth
            variant="outlined"
            value={customPageSizeInput}
            onChange={(e) => setCustomPageSizeInput(e.target.value)}
            inputProps={{ min: 1, max: 10000 }}
            onKeyPress={(e) => e.key === 'Enter' && handleCustomPageSizeSubmit()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomPageSizeDialogOpen(false)}>取消</Button>
          <Button onClick={handleCustomPageSizeSubmit}>确定</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default App;
