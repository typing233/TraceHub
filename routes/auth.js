const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '用户名和密码不能为空'
      });
    }

    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({
        success: false,
        error: '用户名长度应在 3-20 个字符之间'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: '密码长度不能少于 6 个字符'
      });
    }

    const user = User.create(username, password);
    const session = User.createSession(user.id);

    res.cookie('session_token', session.sessionToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username
        },
        sessionToken: session.sessionToken
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '用户名和密码不能为空'
      });
    }

    const user = User.findByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }

    if (!User.validatePassword(user, password)) {
      return res.status(401).json({
        success: false,
        error: '用户名或密码错误'
      });
    }

    const session = User.createSession(user.id);

    res.cookie('session_token', session.sessionToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict'
    });

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username
        },
        sessionToken: session.sessionToken
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.post('/logout', authMiddleware, (req, res) => {
  try {
    User.deleteSession(req.sessionToken);
    res.clearCookie('session_token');
    res.json({
      success: true,
      message: '已退出登录'
    });
  } catch (error) {
    console.error('退出登录错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

router.get('/me', authMiddleware, (req, res) => {
  const user = User.findById(req.user.id);
  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        hasApiKey: !!user.deepseek_api_key,
        created_at: user.created_at
      }
    }
  });
});

router.put('/api-key', authMiddleware, (req, res) => {
  try {
    const { apiKey } = req.body;
    
    const user = User.updateApiKey(req.user.id, apiKey || '');
    
    res.json({
      success: true,
      data: {
        hasApiKey: !!user.deepseek_api_key
      },
      message: apiKey ? 'API Key 已更新' : 'API Key 已清除'
    });
  } catch (error) {
    console.error('更新 API Key 错误:', error);
    res.status(500).json({
      success: false,
      error: '服务器错误'
    });
  }
});

module.exports = router;
