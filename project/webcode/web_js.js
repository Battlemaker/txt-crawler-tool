document.getElementById('scrapeBtn').addEventListener('click', async () => {
  // 获取当前标签页 URL
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab.url;

  // 发送请求给 Python 后端
  fetch('http://127.0.0.1:5000/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url })
  })
    .then(response => response.json())
    .then(data => {
      if (data.error) {
        document.getElementById('result').textContent = '错误: ' + data.error;
      } else {
        document.getElementById('result').textContent = `标题: ${data.title}\n\n内容:\n${data.content}`;
      }
    })
    .catch(err => {
      document.getElementById('result').textContent = '请求失败: ' + err;
    });
});