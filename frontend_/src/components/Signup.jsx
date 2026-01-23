// src/components/Signup.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signupUser } from "../api";

const Signup = () => {
  const navigate = useNavigate();

  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmitSignup = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      const data = await signupUser({
        firstname,
        lastname,
        username,
        email,
        password,
      });

      alert(data.message);
      navigate("/login", { replace: false });
    } catch (error) {
      console.error(error.message);
      alert(error.message);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center">
      <div className="w-11/12 px-12 py-5 bg-white sm:w-8/12 md:w-1/2 lg:w-5/12">
        <h1 className="text-xl text-center font-semibold">
          Welcome to DOCCHAT
        </h1>
        <h3 className="font-normal text-center">
          Are you ready to Chat with your Docs?
        </h3>
        <form onSubmit={handleSubmitSignup} className="mt-6">
          <div className="flex justify-between gap-3">
            <span className="w-1/2">
              <label
                htmlFor="firstname"
                className="block text-xs font-semibold text-gray-600 uppercase"
              >
                Firstname
              </label>
              <input
                id="firstname"
                type="text"
                name="firstname"
                value={firstname}
                onChange={(e) => {
                  setFirstname(e.target.value);
                }}
                placeholder="John"
                autoComplete="on"
                className="block w-full p-3 mt-2 text-gray-700 bg-gray-200 appearance-none focus:outline-none focus:bg-gray-300 focus:shadow-inner"
                required
              />
            </span>
            <span className="w-1/2">
              <label
                htmlFor="lastname"
                className="block text-xs font-semibold text-gray-600 uppercase"
              >
                Lastname
              </label>
              <input
                id="lastname"
                type="text"
                name="lastname"
                value={lastname}
                onChange={(e) => {
                  setLastname(e.target.value);
                }}
                placeholder="Doe"
                autoComplete="on"
                className="block w-full p-3 mt-2 text-gray-700 bg-gray-200 appearance-none focus:outline-none focus:bg-gray-300 focus:shadow-inner"
                required
              />
            </span>
          </div>
          <label
            htmlFor="username"
            className="block mt-2 text-xs font-semibold text-gray-600 uppercase"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            name="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
            placeholder="johndoe123"
            autoComplete="on"
            className="block w-full p-3 mt-2 text-gray-700 bg-gray-200 appearance-none focus:outline-none focus:bg-gray-300 focus:shadow-inner"
            required
          />
          <label
            htmlFor="email"
            className="block mt-2 text-xs font-semibold text-gray-600 uppercase"
          >
            E-mail
          </label>
          <input
            id="email"
            type="email"
            name="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
            }}
            placeholder="john.doe@company.com"
            autoComplete="on"
            className="block w-full p-3 mt-2 text-gray-700 bg-gray-200 appearance-none focus:outline-none focus:bg-gray-300 focus:shadow-inner"
            required
          />
          <label
            htmlFor="password"
            className="block mt-2 text-xs font-semibold text-gray-600 uppercase"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            name="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            placeholder="********"
            autoComplete="off"
            className="block w-full p-3 mt-2 text-gray-700 bg-gray-200 appearance-none focus:outline-none focus:bg-gray-300 focus:shadow-inner"
            required
          />
          <label
            htmlFor="password-confirm"
            className="block mt-2 text-xs font-semibold text-gray-600 uppercase"
          >
            Confirm password
          </label>
          <input
            id="password-confirm"
            type="password"
            name="password-confirm"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
            }}
            placeholder="********"
            autoComplete="off"
            className="block w-full p-3 mt-2 text-gray-700 bg-gray-200 appearance-none focus:outline-none focus:bg-gray-300 focus:shadow-inner"
            required
          />
          <button
            type="submit"
            className="w-full py-2 mt-3 text-sm font-medium tracking-widest text-white uppercase bg-black shadow-lg focus:outline-none hover:bg-gray-900 hover:shadow-none"
          >
            Sign up
          </button>
          <p
            onClick={() => navigate("/login", { replace: true })}
            className="flex justify-between mt-4 text-xs text-gray-500 cursor-pointer hover:text-black"
          >
            Already registered?
          </p>
        </form>
      </div>
    </div>
  );
};

export default Signup;
