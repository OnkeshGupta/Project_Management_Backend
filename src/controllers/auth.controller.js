import { User } from "../models/user.models.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { emailVerificationMailgenContent, sendEmail } from "../utils/mail.js";

const generateAccessandRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave: false});
        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(
            500,
            "Something went wrong while generating access token"
        );
    }
};

const registerUser = asyncHandler (async (req, res) => {
    const {email, username, password, role} = req.body;
    const existingUser = await User.findOne({
        $or: [{username}, {email}]
    });
    if(existingUser){
        throw new ApiError(409, "User with username or email already exists", []);
    }
    const user = await User.create({
        email,
        password,
        username,
        isEmailVerified: false
    });
    const {unhashedToken, hashedToken, tokenExpiry} = user.generateTemporaryToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpiry = tokenExpiry;
    await user.save({validateBeforeSave: false});
    await sendEmail(
        {
            email: user?.email,
            subject: "Please verify your email",
            mailgenContent: emailVerificationMailgenContent(
                user.username,
                `${req.protocol}://${req.get("host")}/api/v1/users/verify-email/${unhashedToken}`
            )
        }
    );
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
    );
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user");
    }
    return res
            .status(201)
            .json(
                new ApiResponse(
                    200,
                    {user: createdUser},
                    "User registered successfully and verification email has been sent to your mail"
                )
            );
});

export {
    registerUser
};