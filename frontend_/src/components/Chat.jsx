import React from "react";
import TestChat from "./subcomponents/TestChat";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Chat() {
  const navigate = useNavigate();

  return (
    <div className="h-screen bg-gray-50">
      <TestChat />
    </div>
  );
}

export default Chat;
