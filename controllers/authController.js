const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key';
const EXPIRES_IN = 2;

function resSuccess(data = {}, msg = 'success') {
    return { code: 0, msg, data };
}

function resError(msg, detail = '') {
    return { code: 1, msg, detail };
}

const getCredentials = (body) => {
    return {
        username: body.username || body.Username,
        password: body.password || body.Password
    };
};

exports.register = async (req, res) => {
    try {
        console.log('register called, body:', req.body);
        const { username, password } = getCredentials(req.body);
        
        if (!username || !password) {
            return res.json(resError('用户名或密码不能为空'));
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const [result] = await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        const insertId = result.insertId;
        
        const token = jwt.sign({ userId: insertId, username }, JWT_SECRET, { expiresIn: EXPIRES_IN });
        
        res.json(resSuccess({
            user: { UserId: insertId.toString() },
            token
        }));
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.json(resError('用户名已存在', 'Duplicate username'));
        } else {
            res.json(resError('注册失败', error.message));
        }
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = getCredentials(req.body);
        
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) {
            return res.json(resError('用户不存在', 'User not found'));
        }
        
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (!isMatch) {
            return res.json(resError('密码错误', 'Incorrect password'));
        }
        
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: EXPIRES_IN });
        
        res.json(resSuccess({
            user: { UserId: user.id.toString() },
            token
        }));
    } catch (error) {
        res.json(resError('登录失败', error.message));
    }
};

exports.getRank = async (req, res) => {
    try {
        const n = parseInt(req.body.n) || 10;
        
        console.log('getRank called, n:', n);
        
        const [ranks] = await db.query('SELECT username, score FROM users ORDER BY score DESC LIMIT ?', [n]);
        
        console.log('ranks:', ranks);
        
        const rankList = ranks.map((r, i) => ({
            Rank: i + 1,
            UserName: r.username,
            Score: r.score || 0
        }));
        
        res.json(resSuccess({ Ranks: rankList }));
    } catch (error) {
        res.json(resError('获取排行榜失败', error.message));
    }
};

exports.authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.json(resError('未登录', 'No token provided'));
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.json(resError('登录已过期', 'Token expired'));
    }
};