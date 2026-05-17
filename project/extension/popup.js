document.getElementById('scrapeBtn').addEventListener('click', async () => {

  const result = document.getElementById('result');

  result.textContent = '正在提取正文...';

  try {

    // 获取当前页面
    let [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    // 在网页中执行JS
    chrome.scripting.executeScript({

      target: {
        tabId: tab.id
      },

      func: () => {

        // 获取标题
        const titleEl =
          document.querySelector('#chaptername');

        // 获取正文
        const contentEl =
          document.querySelector('#txt');

        // 提取文本
        const title =
          titleEl ? titleEl.innerText.trim() : '无标题';

        const content =
          contentEl ? contentEl.innerText.trim() : '未找到正文';

        return {
          title,
          content
        };
      }

    }, (res) => {

      if (
        !res ||
        !res[0] ||
        !res[0].result
      ) {

        result.textContent = '抓取失败';
        return;
      }

      const data = res[0].result;

      // 显示结果
      result.textContent =
        `标题：${data.title}\n\n${data.content}`;

      // 保存到全局变量
      window.currentArticle = data;
    });

  } catch (err) {

    result.textContent =
      '错误：' + err.message;
  }
});