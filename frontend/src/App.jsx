import React from "react";
import Home from "./components/Home";
import Login from "./components/Login";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Signup from "./components/Signup";
import Chat from "./components/Chat";
import UploadDocs from "./components/UploadDocs";
import RemoveDocs from "./components/RemoveDocs";
import ProtectedRoute from "./components/subcomponents/ProtectedRoute";
import TestChat from "./components/subcomponents/TestChat";

const App = () => {
  return (
    <div>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Signup />} />
          <Route path="/login" element={<Login />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<Home />} />
            <Route path="/upload" element={<UploadDocs />} />
            <Route path="/remove" element={<RemoveDocs />} />
            <Route path="/chat" element={<Chat />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
};

export default App;
