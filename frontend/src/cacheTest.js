// 测试localStorage缓存功能
const testCache = () => {
  console.log('开始测试缓存功能...');
  
  // 测试数据
  const testData = {
    results: [
      { id: 1, title: '测试文档1', abstract: '这是测试摘要1' },
      { id: 2, title: '测试文档2', abstract: '这是测试摘要2' }
    ],
    total: 2,
    rewrittenTerms: ['测试', '文档'],
    searchTime: 1.5,
    timestamp: Date.now()
  };
  
  // 测试保存
  try {
    localStorage.setItem('test_cache', JSON.stringify(testData));
    console.log('✓ 缓存保存成功');
  } catch (error) {
    console.error('✗ 缓存保存失败:', error);
    return;
  }
  
  // 测试读取
  try {
    const cached = localStorage.getItem('test_cache');
    if (cached) {
      const data = JSON.parse(cached);
      console.log('✓ 缓存读取成功:', data);
    } else {
      console.error('✗ 缓存读取失败: 数据为空');
    }
  } catch (error) {
    console.error('✗ 缓存读取失败:', error);
  }
  
  // 清理测试数据
  localStorage.removeItem('test_cache');
  console.log('✓ 测试完成，已清理测试数据');
};

// 在浏览器控制台中运行: testCache()
window.testCache = testCache;

export default testCache; 