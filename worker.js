addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

/**
 * 入口路由
 */
async function handleRequest(request) {
  const url = new URL(request.url)
  const { pathname } = url

  // 1. 访问根路径，返回前端HTML
  if (pathname === '/' && request.method === 'GET') {
    return serveHtmlPage()
  }

  // 2. 获取符合“用户名正则 + 指定域名”的用户列表
  if (pathname === '/api/listByUsernamePattern' && request.method === 'GET') {
    return listByUsernamePattern()
  }

  // 3. 单个删除用户
  if (pathname === '/api/deleteUser' && request.method === 'POST') {
    return deleteSingleUser(request)
  }

  return new Response('Not Found', { status: 404 })
}

/**
 * 1. 返回一个带进度条的HTML页面，前端逻辑：
 *    - 点击“获取列表” -> GET /api/listByUsernamePattern
 *    - 点击“逐个删除” -> 前端循环调用 /api/deleteUser
 */
function serveHtmlPage() {
  const html = `
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <title>按用户名正则批量删除示例</title>
  <style>
    body {
      font-family: sans-serif;
      margin: 20px;
      background-color: #f7f7f7;
    }
    .btn {
      padding: 8px 16px;
      margin: 0 4px;
      cursor: pointer;
      background: #4CAF50;
      color: #fff;
      border: none;
      border-radius: 4px;
    }
    .btn:hover {
      background: #45A049;
    }
    table {
      border-collapse: collapse;
      margin-top: 16px;
      width: 100%;
      max-width: 600px;
      background: #fff;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f2f2f2;
    }
    .delete-single-btn {
      background-color: #f44336;
    }
    .delete-single-btn:hover {
      background-color: #e53935;
    }
    #progressContainer {
      margin: 16px 0;
      display: none;
    }
    #progressBar {
      width: 100%;
      max-width: 400px;
    }
    #progressText {
      margin-left: 8px;
    }
  </style>
</head>
<body>
  <h1>批量删除符合“@chatgpt.nyc.mn + n位字母数字”用户名的用户</h1>
  <button class="btn" id="btnList">获取符合正则的用户列表</button>
  <button class="btn" id="btnDeleteAll">逐个删除所有(带进度)</button>

  <!-- 进度条区域 -->
  <div id="progressContainer">
    <progress id="progressBar" value="0" max="100"></progress>
    <span id="progressText"></span>
  </div>

  <table id="userTable" style="display: none;">
    <thead>
      <tr>
        <th>邮箱 (primaryEmail)</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <script>
    const btnList = document.getElementById('btnList')
    const btnDeleteAll = document.getElementById('btnDeleteAll')
    const userTable = document.getElementById('userTable')
    const tbody = userTable.querySelector('tbody')

    // 进度条相关
    const progressContainer = document.getElementById('progressContainer')
    const progressBar = document.getElementById('progressBar')
    const progressText = document.getElementById('progressText')

    // 缓存筛选到的用户
    let filteredUsers = []

    // 1. 获取符合正则的用户列表
    btnList.addEventListener('click', async () => {
      try {
        // 清空旧列表
        tbody.innerHTML = ''
        userTable.style.display = 'none'
        filteredUsers = []

        const res = await fetch('/api/listByUsernamePattern')
        if (!res.ok) {
          const err = await res.text()
          alert('获取列表失败: ' + err)
          return
        }

        const data = await res.json()
        if (data.length === 0) {
          alert('没有符合条件的用户')
          return
        }

        filteredUsers = data

        // 渲染表格
        data.forEach(user => {
          const tr = document.createElement('tr')
          tr.innerHTML = \`
            <td>\${user.primaryEmail}</td>
            <td>
              <button class="btn delete-single-btn" data-email="\${user.primaryEmail}">
                删除
              </button>
            </td>
          \`
          tbody.appendChild(tr)
        })
        userTable.style.display = 'table'

        // 为单个删除按钮添加点击事件
        document.querySelectorAll('.delete-single-btn').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            const email = e.target.getAttribute('data-email')
            if (!confirm(\`确认删除用户 \${email} 吗？此操作不可逆。\`)) {
              return
            }
            try {
              const ok = await deleteSingleUser(email)
              if (ok) {
                alert(\`已删除用户: \${email}\`)
                // 从DOM上移除对应行
                e.target.closest('tr').remove()
                // 从数组中移除
                filteredUsers = filteredUsers.filter(u => u.primaryEmail !== email)
              } else {
                alert('删除失败')
              }
            } catch (err) {
              alert('删除出错: ' + err.message)
            }
          })
        })
      } catch (err) {
        alert('请求出错: ' + err.message)
      }
    })

    // 2. 批量删除 - 前端循环 + 进度条
    btnDeleteAll.addEventListener('click', async () => {
      if (filteredUsers.length === 0) {
        alert('请先点击“获取列表”，或无可删除用户')
        return
      }
      if (!confirm(\`是否确认删除这些用户？共 \${filteredUsers.length} 个，操作不可逆！\`)) {
        return
      }

      progressContainer.style.display = 'block'
      progressBar.value = 0
      progressBar.max = filteredUsers.length
      progressText.textContent = \`0 / \${filteredUsers.length}\`

      let successCount = 0
      let failCount = 0

      // 逐个删除
      for (let i = 0; i < filteredUsers.length; i++) {
        const user = filteredUsers[i]
        const email = user.primaryEmail

        try {
          const ok = await deleteSingleUser(email)
          if (ok) {
            successCount++
            // 从表格移除
            const row = tbody.querySelector(\`button[data-email="\${email}"]\`)?.closest('tr')
            row && row.remove()
          } else {
            failCount++
          }
        } catch (err) {
          failCount++
          console.error(err)
        }

        progressBar.value = i + 1
        progressText.textContent = \`\${i + 1} / \${filteredUsers.length}\`
      }

      alert(\`删除完毕。成功: \${successCount}，失败: \${failCount}\`)
      filteredUsers = []
    })

    // 单个删除用户的 fetch 封装
    async function deleteSingleUser(email) {
      const res = await fetch('/api/deleteUser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      return res.ok
    }
  </script>
</body>
</html>
`
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  })
}

/**
 * 2. GET /api/listByUsernamePattern
 *    拉取 @chatgpt.nyc.mn 域的所有用户，正则判断用户名是否10位字母或数字
 */
async function listByUsernamePattern() {
  try {
    const accessToken = await getAccessToken()
    // 先获取所有用户 (domain=chatgpt.nyc.mn)
    const allUsers = await listAllUsers(accessToken, 'chatgpt.nyc.mn')

    // 正则：用户名必须是10位字母或数字
    const usernameRegex = /^[A-Za-z0-9]{8}$/

    // 筛选符合域名 + 用户名正则
    const filtered = allUsers.filter(u => {
      if (!u.primaryEmail) return false
      const [username, domain] = u.primaryEmail.split('@')
      if (domain !== 'chatgpt.nyc.mn') return false
      return usernameRegex.test(username)
    })

    return new Response(JSON.stringify(filtered), {
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
    })
  } catch (err) {
    return new Response('获取用户列表失败: ' + err.message, { status: 500 })
  }
}

/**
 * 3. POST /api/deleteUser
 *    根据 email 删除用户
 */
async function deleteSingleUser(request) {
  try {
    const { email } = await request.json()
    if (!email) {
      return new Response('缺少 email 参数', { status: 400 })
    }

    const accessToken = await getAccessToken()
    const url = 'https://admin.googleapis.com/admin/directory/v1/users/' + encodeURIComponent(email)
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + accessToken },
    })

    if (resp.ok) {
      return new Response('删除成功')
    } else {
      const errText = await resp.text()
      return new Response('删除失败: ' + errText, { status: 500 })
    }
  } catch (err) {
    return new Response('删除用户出错: ' + err.message, { status: 500 })
  }
}

/**
 * 工具函数：获取指定域名(或customer)下所有用户 (分页)
 */
async function listAllUsers(accessToken, domain) {
  // 如果你想抓整个 Workspace，可用 customer='my_customer'
  // https://developers.google.com/admin-sdk/directory/v1/reference/users/list
  let pageToken = null
  const users = []

  do {
    const url = new URL('https://admin.googleapis.com/admin/directory/v1/users')
    if (domain) {
      // 只取指定域名
      url.searchParams.set('domain', domain)
    } else {
      // 或者取整个Workspace
      url.searchParams.set('customer', 'my_customer')
    }
    url.searchParams.set('maxResults', '500')
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken)
    }

    const resp = await fetch(url.toString(), {
      headers: { Authorization: 'Bearer ' + accessToken },
    })
    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error('获取用户列表失败: ' + errText)
    }
    const data = await resp.json()
    if (data.users) {
      users.push(...data.users)
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return users
}

/**
 * 工具函数：获取Access Token
 * 通过Google OAuth 2.0的Refresh Token
 */
async function getAccessToken() {
  const tokenEndpoint = 'https://oauth2.googleapis.com/token'
  const params = new URLSearchParams()
  params.append('client_id', GOOGLE_CLIENT_ID)
  params.append('client_secret', GOOGLE_CLIENT_SECRET)
  params.append('refresh_token', GOOGLE_REFRESH_TOKEN)
  params.append('grant_type', 'refresh_token')

  const tokenResp = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })

  if (!tokenResp.ok) {
    const errText = await tokenResp.text()
    throw new Error('获取AccessToken失败: ' + errText)
  }
  const tokenData = await tokenResp.json()
  return tokenData.access_token
}

// ======== 请在生产环境改用Secrets存储，不要直接明文写在代码里 =============
const GOOGLE_CLIENT_ID = ''
const GOOGLE_CLIENT_SECRET = ''
const GOOGLE_REFRESH_TOKEN = ''
