const User = require('../models/User');
const OTP = require('../models/OTP');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/email');

const OTP_EXPIRY_MINUTES = 5;

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateToken = (id, role) => {
    return jwt.sign(
        { id, role },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
};

const createAndSendOTP = async (email, action = 'account_verification') => {
    // Remove any previous OTP for this email/action
    await OTP.deleteMany({
        email,
        action
    });

    const otp = generateOTP();

    await OTP.create({
        email,
        otp,
        action,
        createdAt: new Date()
    });

    await sendOTPEmail(email, otp, action);

    console.log(`OTP sent to ${email} for ${action}`);
};

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: 'Name, email and password are required'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        let user = await User.findOne({
            email: normalizedEmail
        });

        if (user) {
            return res.status(400).json({
                message: 'User already exists'
            });
        }

        const salt = await bcrypt.genSalt(10);

        const hashedPassword = await bcrypt.hash(
            password,
            salt
        );

        user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: 'user',
            isVerified: false
        });

        await createAndSendOTP(
            normalizedEmail,
            'account_verification'
        );

        return res.status(201).json({
            message: 'OTP sent to email. Please verify.',
            email: user.email
        });

    } catch (error) {
        console.error('Register Error:', error);

        return res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: 'Email and password are required'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const user = await User.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(400).json({
                message: 'Invalid credentials'
            });
        }

        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                message: 'Invalid credentials'
            });
        }

        // Admin does not need email verification
        if (!user.isVerified && user.role !== 'admin') {

            await createAndSendOTP(
                normalizedEmail,
                'account_verification'
            );

            return res.status(403).json({
                message: 'Account not verified',
                needsVerification: true,
                email: user.email
            });
        }

        return res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(
                user.id,
                user.role
            )
        });

    } catch (error) {
        console.error('Login Error:', error);

        return res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                message: 'Email and OTP are required'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedOTP = String(otp).trim();

        // Find latest OTP for this email
        const validOTP = await OTP.findOne({
            email: normalizedEmail,
            action: 'account_verification'
        }).sort({
            createdAt: -1
        });

        if (!validOTP) {
            return res.status(400).json({
                message: 'OTP not found or expired'
            });
        }

        // OTP expires after 10 minutes
        const otpAge =
            Date.now() - new Date(validOTP.createdAt).getTime();

        const otpExpiry =
            OTP_EXPIRY_MINUTES * 60 * 1000;

        if (otpAge > otpExpiry) {
            await OTP.deleteOne({
                _id: validOTP._id
            });

            return res.status(400).json({
                message: 'OTP has expired. Please request a new OTP.'
            });
        }

        // Compare OTP
        if (validOTP.otp !== normalizedOTP) {
            return res.status(400).json({
                message: 'Invalid OTP'
            });
        }

        const user = await User.findOneAndUpdate(
            {
                email: normalizedEmail
            },
            {
                isVerified: true
            },
            {
                new: true
            }
        );

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        // Delete OTP after successful verification
        await OTP.deleteOne({
            _id: validOTP._id
        });

        return res.json({
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(
                user.id,
                user.role
            )
        });

    } catch (error) {
        console.error('Verify OTP Error:', error);

        return res.status(500).json({
            message: 'Server Error',
            error: error.message
        });
    }
};