import React, { useState } from 'react';
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
  InputLabel
} from '@mui/material';
import axios from 'axios';

function App() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('keyword');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [total, setTotal] = useState(0);

  const handleSearch = async (newPage = 1) => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const response = await axios.get(`http://34.219.20.61:5000/search`, {
        params: {
          query: query,
          page: newPage,
          pageSize: pageSize,
          searchType: searchType
        }
      });
      setResults(response.data.results);
      setTotal(response.data.total);
      setPage(newPage);
    } catch (error) {
      console.error('搜索出错:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (event, value) => {
    handleSearch(value);
  };

  const handlePageSizeChange = (event) => {
    const newPageSize = event.target.value;
    setPageSize(newPageSize);
    handleSearch(1);
  };

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
            <MenuItem value="vector">向量搜索</MenuItem>
            <MenuItem value="hybrid">混合搜索</MenuItem>
          </Select>
        </FormControl>
        <Button 
          variant="contained" 
          onClick={() => handleSearch(1)}
          disabled={loading}
          sx={{ minWidth: 120 }}
        >
          {loading ? <CircularProgress size={24} /> : '搜索'}
        </Button>
      </Box>

      {results.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            共找到 {total} 条结果
          </Typography>
          <FormControl sx={{ minWidth: 120 }}>
            <InputLabel>每页显示</InputLabel>
            <Select
              value={pageSize}
              label="每页显示"
              onChange={handlePageSizeChange}
            >
              <MenuItem value={30}>30</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      {results.map((result) => (
        <Card key={result.id} sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {result.title}
            </Typography>
            <Typography color="text.secondary" gutterBottom>
              关键词: {Array.isArray(result.keywords) ? result.keywords.join('、') : result.keywords.split(/[,，]/).join('、')}
            </Typography>
            <Typography variant="body2" paragraph>
              {result.abstract?.substring(0, 200)}...
            </Typography>
            <Typography variant="caption" color="text.secondary">
              文档ID: {result.id} | 相关度得分: {result.score}
            </Typography>
          </CardContent>
        </Card>
      ))}

      {results.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination 
            count={Math.ceil(total / pageSize)} 
            page={page} 
            onChange={handlePageChange}
            color="primary"
          />
        </Box>
      )}
    </Container>
  );
}

export default App;
