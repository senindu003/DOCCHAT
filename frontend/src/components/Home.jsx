import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Dialog from "./Dialog";

const Home = () => {
  const [isDocsAvailable, setIsDocsAvailable] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const user_details = JSON.parse(localStorage.getItem("userDetails"));
    if (Object.keys(user_details.meta_data).length != 0) {
      setIsDocsAvailable(true);
    }
  }, []);

  const check = () => {
    !isDocsAvailable
      ? setNotice("Please upload at least one document first.")
      : navigate("/chat", { replace: false });
  };

  const navigate = useNavigate();

  return (
    <div className="relative h-screen w-full justify-center items-center flex flex-col">
      <Dialog open={Boolean(notice)} title="Documents required" onClose={() => setNotice(null)}>
        {notice}
      </Dialog>
      <div className="absolute top-1 right-1 p-3 text-xl border-2 rounded-xl border-amber-500">
        <button
          onClick={() => {
            localStorage.clear();
            navigate("/login", { replace: false });
          }}
        >
          LogOut
        </button>
      </div>
      <div className="flex flex-row w-3/4 justify-around gap-x-10 items-center text-center">
        <button
          onClick={() => {
            navigate("/upload", { replace: false });
          }}
          className="flex-1 text-4xl p-8 border-2 rounded-2xl border-red-400 cursor-pointer"
        >
          Upload Docs
        </button>
        <button
          onClick={() => {
            check();
          }}
          className={`${isDocsAvailable ? "" : "opacity-50"} flex-1 text-4xl p-8 border-2 rounded-2xl border-green-400 cursor-pointer`}
        >
          Chat with Docs
        </button>
      </div>
    </div>
  );
};

export default Home;
