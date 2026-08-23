// src/components/Login.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api";
import Dialog from "./Dialog";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(null);

  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    try {
      const data = await loginUser({ username: email, password: password });

      localStorage.setItem("token", data.access_token);
      localStorage.setItem("userDetails", JSON.stringify(data.user_details));
      localStorage.setItem(
        "messages",
        JSON.stringify([
          {
            id: "1",
            content: `Hello ${data.user_details.username}! \n\nI'm DOCCHAT. Ask me anything about your documents!`,
            role: "assistant",
            timestamp: new Date(),
            isQuiz: false,
          },
        ])
      );
      setNotice({ message: data.message, redirect: true });
    } catch (error) {
      console.error(error.message);
      setNotice({ message: error.message, redirect: false });
    }
  };

  return (
    <div className="relative flex min-h-screen text-gray-800 antialiased flex-col justify-center overflow-hidden bg-gray-50 py-6 sm:py-12">
      <Dialog
        open={Boolean(notice)}
        title={notice?.redirect ? "Login successful" : "Login failed"}
        onClose={() => {
          const shouldRedirect = notice?.redirect;
          setNotice(null);
          if (shouldRedirect) navigate("/home", { replace: false });
        }}
      >
        {notice?.message}
      </Dialog>
      <div className="relative py-3 sm:w-96 mx-auto text-center">
        <span className="text-2xl font-light ">Login to your account</span>
        <div className="mt-4 bg-white shadow-md rounded-lg text-left">
          <div className="h-2 bg-purple-600 rounded-t-md"></div>
          <form onSubmit={handleSubmitLogin} className="px-8 py-6 ">
            <label className="block font-semibold"> Username or Email </label>
            <input
              id="email"
              type="text"
              name="email"
              value={email}
              autoComplete="on"
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              placeholder="Username or Email"
              required
              className="border w-full h-5 px-3 py-5 mt-2 hover:outline-none focus:outline-none focus:ring-indigo-500 focus:ring-1 rounded-md"
            />
            <label className="block mt-3 font-semibold"> Password </label>
            <input
              id="password"
              type="password"
              name="password"
              value={password}
              autoComplete="on"
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              placeholder="Password"
              required
              className="border w-full h-5 px-3 py-5 mt-2 hover:outline-none focus:outline-none focus:ring-indigo-500 focus:ring-1 rounded-md"
            />
            <div className="flex justify-between items-baseline">
              <button
                type="submit"
                className="mt-4 bg-purple-600 text-white py-2 px-6 rounded-md hover:bg-purple-800 "
              >
                Login
              </button>
              <p className="text-sm">
                Don't have an account?
                <span
                  onClick={() => {
                    navigate("/", { replace: false });
                  }}
                  className="ml-1 text-blue-600 cursor-pointer underline underline-offset-2"
                >
                  Register
                </span>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
