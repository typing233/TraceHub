const User = require('../models/User');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const sessionToken = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : req.cookies?.session_token;

  if (!sessionToken) {
    return res.status(401).json({ 
      success: false, 
      error: '未登录，请先登录' 
    });
  }

  try {
    const session = User.validateSession(sessionToken);
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        error: '登录已过期，请重新登录' 
      });
    }

    req.user = {
      id: session.user_id,
      username: session.username,
      deepseekApiKey: session.deepseek_api_key
    };
    req.sessionToken = sessionToken;
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    return res.status(500).json({ 
      success: false, 
      error: '服务器错误' 
    });
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const sessionToken = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : req.cookies?.session_token;

  if (sessionToken) {
    try {
      const session = User.validateSession(sessionToken);
      if (session) {
        req.user = {
          id: session.user_id,
          username: session.username,
          deepseekApiKey: session.deepseek_api_key
        };
        req.sessionToken = sessionToken;
      }
    } catch {}
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };
