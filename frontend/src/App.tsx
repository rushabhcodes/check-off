"use client";

import { useState, useEffect, useCallback } from "react";
import "./App.css";
import io, { Socket } from "socket.io-client";
import { Checkbox } from "./components/ui/checkbox";

const numberOfCheckboxes = 10;
const totalCheckboxes = 100; // For the 4v4 mode

function App() {
  const [checkboxStates, setCheckboxStates] = useState<boolean[]>(Array(totalCheckboxes).fill(false));
  const [shuffledIndices, setShuffledIndices] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [timer, setTimer] = useState<number>(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [totalTime, setTotalTime] = useState<number>(0);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null); // Red or Blue team
  const [gameMode, setGameMode] = useState<string>("original"); // "original" or "4v4"

  const handleSocketError = useCallback((message: string) => {
    console.error("Socket error:", message);
    setError(message);
  }, []);

  useEffect(() => {
    const socketInstance = io("http://localhost:3000");
    setSocket(socketInstance);

    const getShuffledIndices = (count: number): number[] => {
      const indices = Array.from({ length: count }, (_, i) => i);
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      return indices;
    };

    setShuffledIndices(getShuffledIndices(gameMode === "original" ? numberOfCheckboxes : totalCheckboxes));
    setLoading(false);

    socketInstance.on("checkboxStates", (states: boolean[]) => {
      setCheckboxStates(states);
    });

    socketInstance.on("timerUpdate", ({ timer }: { timer: number }) => {
      setTimer(timer);
    });

    socketInstance.on("timerStopped", ({ totalTime }: { totalTime: number }) => {
      setTotalTime(totalTime);
      setShowModal(true);
    });

    socketInstance.on("error", handleSocketError);

    return () => {
      socketInstance.off("checkboxStates");
      socketInstance.off("timerUpdate");
      socketInstance.off("timerStopped");
      socketInstance.off("error");
      socketInstance.disconnect();
    };
  }, [handleSocketError, gameMode]);

  const handleStartTimer = () => {
    if (socket && roomId) {
      socket.emit("startTimer", roomId);
    }
  };

  const handleCheckboxChange = (index: number) => (checked: boolean | undefined) => {
    if (checked !== undefined && roomId) {
      const updatedStates = [...checkboxStates];
      updatedStates[index] = checked;
      setCheckboxStates(updatedStates);
      socket?.emit("checkboxChange", roomId, index, checked);
    }
  };

  useEffect(() => {
    if (gameMode === "4v4" && roomId) {
      const teamColor = team === "red" ? "red" : "blue";
      const teamCheckboxesChecked = checkboxStates
        .filter((_, index) => teamColor === "red" ? index < 50 : index >= 50)
        .every(checked => checked);

      if (teamCheckboxesChecked) {
        socket?.emit("teamWon", roomId, team);
      }
    }
  }, [checkboxStates, socket, roomId, gameMode, team]);

  const handleCloseModal = () => setShowModal(false);

  const handleRoomAction = (action: 'create' | 'join') => {
    const roomName = (document.getElementById("roomName") as HTMLInputElement).value;
    if (socket && roomName) {
      socket.emit(`${action}Room`, roomName, gameMode);
      setRoomId(roomName);
    }
  };

  const handleLeaveRoom = () => {
    if (socket && roomId) {
      socket.emit("leaveRoom", roomId);
      setRoomId(null);
    }
  };

  const handleSelectTeam = (selectedTeam: string) => setTeam(selectedTeam);

  const handleGameModeChange = (mode: string) => setGameMode(mode);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-lg font-semibold">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-lg font-semibold text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4">
      <h1 className="text-3xl md:text-4xl font-bold mb-6 text-center">Check Off</h1>
      {!roomId ? (
        <div className="mb-6">
          <input
            type="text"
            placeholder="Enter room name"
            id="roomName"
            className="px-4 py-2 border border-gray-300 rounded mr-4"
          />
          <select
            value={gameMode}
            onChange={(e) => handleGameModeChange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded mr-4"
          >
            <option value="original">Original</option>
            <option value="4v4">4v4</option>
          </select>
          <button
            onClick={() => handleRoomAction('create')}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Create Room
          </button>
          <button
            onClick={() => handleRoomAction('join')}
            className="ml-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Join Room
          </button>
        </div>
      ) : (
        <>
          {gameMode === "4v4" && !team ? (
            <div className="mb-6">
              <button
                onClick={() => handleSelectTeam("red")}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Join Red Team
              </button>
              <button
                onClick={() => handleSelectTeam("blue")}
                className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Join Blue Team
              </button>
            </div>
          ) : (
            <>
              <button
                className="mb-6 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                onClick={handleLeaveRoom}
              >
                Leave Room
              </button>
              <div className="text-lg mb-4">
                Timer: {Math.floor(timer / 60000)}:
                {String(Math.floor((timer % 60000) / 1000)).padStart(2, "0")}
              </div>
              <button
                className="mb-6 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                onClick={handleStartTimer}
              >
                Start Timer
              </button>
              <div className="grid grid-cols-5 sm:grid-cols-5 md:grid-cols-10 lg:grid-cols-10 xl:grid-cols-10 gap-4 max-w-5xl mx-auto">
                {shuffledIndices.map((index) => (
                  <Checkbox
                    key={index}
                    checked={checkboxStates[index]}
                    onCheckedChange={(checked) =>
                      handleCheckboxChange(index)(checked as boolean)
                    }
                    className={`w-10 h-10 sm:w-8 sm:h-8 transition-transform duration-200 transform hover:scale-110 ${index < 50 ? "bg-red-500" : "bg-blue-500"}`}
                    disabled={    gameMode === "4v4" && (team === "red" && index >= 50 || team === "blue" && index < 50)}
                  />
                ))}
              </div>

              {/* Modal for showing the time taken */}
              {showModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75">
                  <div className="bg-white p-6 rounded shadow-lg text-center">
                    <h2 className="text-2xl font-semibold mb-4">Time Taken</h2>
                    <p className="text-lg">
                      You completed the task in {Math.floor(totalTime / 60000)}:
                      {String(Math.floor((totalTime % 60000) / 1000)).padStart(2, "0")}
                    </p>
                    <button
                      className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      onClick={handleCloseModal}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default App;
