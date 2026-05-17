const contentDiv = document.querySelector("#txt");
const title = document.title;
const content = contentDiv ? contentDiv.innerText : "未抓取到正文";

chrome.runtime.sendMessage({
  action: "send_article",
  data: { title, content }
});