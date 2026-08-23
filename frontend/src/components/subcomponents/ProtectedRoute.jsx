import React from "react";
import { Navigate, Outlet } from "react-router-dom";

const ProtectedRoute = () => {
  const token = localStorage.getItem("token");

  // Check if token exists and is valid (you might want to add more validation)
  if (!token) {
    // Redirect to login if no token
    return <Navigate to="/login" replace />;
  }

  return <Outlet />; // Render child routes
};

export default ProtectedRoute;
