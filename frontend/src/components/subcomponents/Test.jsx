import React, { useEffect, useState } from "react";
import Dialog from "../Dialog";

const Test = () => {
  const [currFiles, setCurrFiles] = useState([]);
  const [categories, setCategories] = useState({});
  const [sections, setSections] = useState({});
  const [notice, setNotice] = useState(null);

  // Simplified useEffect to initialize categories/sections
  useEffect(() => {
    if (currFiles.length > 0) {
      // Get the most recently added files
      const newFiles = currFiles.slice(
        -1 * (currFiles.length - Object.keys(categories).length)
      );

      newFiles.forEach((file) => {
        const filename = file.name;
        // Only initialize if not already exists
        if (!categories.hasOwnProperty(filename)) {
          setCategories((prev) => ({
            ...prev,
            [filename]: "",
          }));
          setSections((prev) => ({
            ...prev,
            [filename]: "",
          }));
        }
      });
    }
  }, [currFiles, categories]);

  const handleDeleteFile = (filename) => {
    // 1. Remove file from currFiles
    setCurrFiles((prev) => prev.filter((file) => file.name !== filename));

    // 2. Remove category entry
    setCategories((prev) => {
      const newCategories = { ...prev };
      delete newCategories[filename];
      return newCategories;
    });

    // 3. Remove section entry
    setSections((prev) => {
      const newSections = { ...prev };
      delete newSections[filename];
      return newSections;
    });
  };

  // Alternative: Single delete handler
  const handleDeleteFileAlt = (filename) => {
    setCurrFiles((prev) => prev.filter((file) => file.name !== filename));
    setCategories((prev) => {
      const { [filename]: removed, ...rest } = prev;
      return rest;
    });
    setSections((prev) => {
      const { [filename]: removed, ...rest } = prev;
      return rest;
    });
  };

  return (
    <div className="h-full flex flex-col justify-center items-center">
      <Dialog open={Boolean(notice)} title="Upload details required" onClose={() => setNotice(null)}>
        {notice}
      </Dialog>
      <div className="h-[15dvh]"></div>
      <div className="w-3/4 flex flex-col justify-center items-center h-[70dvh]">
        <h1 className="text-xl mb-6 ">Drop your files here</h1>
        <div className="w-full max-h-62.5 mb-5 flex flex-col justify-center items-center text-center overflow-auto">
          {currFiles.length > 0 &&
            currFiles.map((item, i) => (
              <div
                key={item.name}
                className={`w-full flex flex-row justify-center py-1.5 gap-x-10 items-center ${
                  i % 2 == 0 ? "bg-gray-200" : "bg-gray-100"
                }`}
              >
                <label
                  htmlFor={item.name}
                  className="flex-1 text-center mx-3 truncate"
                >
                  {item.name}
                </label>
                <input
                  type="text"
                  placeholder="*Category"
                  className="flex-1 text-center border rounded px-2 py-1"
                  value={categories[item.name] || ""}
                  onChange={(e) => {
                    setCategories((prev) => ({
                      ...prev,
                      [item.name]: e.target.value,
                    }));
                  }}
                />
                <input
                  type="text"
                  placeholder="*Section"
                  className="flex-1 text-center border rounded px-2 py-1"
                  value={sections[item.name] || ""}
                  onChange={(e) => {
                    setSections((prev) => ({
                      ...prev,
                      [item.name]: e.target.value,
                    }));
                  }}
                />
                <button
                  onClick={() => handleDeleteFile(item.name)}
                  className="flex-1 text-red-500 hover:text-red-700 cursor-pointer"
                  id={item.name}
                >
                  ❌
                </button>
              </div>
            ))}
        </div>
        <div className="mt-3 text-center flex flex-row justify-between gap-x-40 items-center">
          <label
            htmlFor="send-files"
            className="bg-blue-500 hover:bg-blue-600 transition px-6 py-2 rounded-xl text-white cursor-pointer"
          >
            Choose files
          </label>
          <input
            id="send-files"
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                setCurrFiles((prev) => {
                  // Remove files that are already in currFiles
                  const newFiles = files.filter(
                    (file) => !prev.some((f) => f.name === file.name)
                  );
                  return [...prev, ...newFiles];
                });
              }
              e.target.value = ""; // Reset input
            }}
          />
          <button
            onClick={() => {
              try {
                const metaData = currFiles.map((file) => {
                  if (
                    categories[file.name] == "" ||
                    sections[file.name] == ""
                  ) {
                    throw new Error("Categories and sections cannot be empty!");
                  }
                  return {
                    name: file.name,
                    category: categories[file.name],
                    section: sections[file.name],
                  };
                });
              } catch (err) {
                setNotice(err.message || String(err));
              }

              console.log("Files to upload:", metaData);
            }}
            className="bg-blue-500 hover:bg-blue-600 transition px-6 py-2 rounded-xl text-white cursor-pointer"
          >
            Upload ({currFiles.length})
          </button>
        </div>
      </div>
      <div className="h-[15dvh]"></div>
    </div>
  );
};

export default Test;
