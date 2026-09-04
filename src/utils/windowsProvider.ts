import { createRequire } from "node:module";
import type { ProcessInfo, Provider, StdoutSink } from "./Provider";
import type koffiModule from "koffi";

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const PROCESS_VM_READ = 0x0010;
const STD_OUTPUT_HANDLE = -11;
const FILE_TYPE_DISK = 1;
const FILE_TYPE_CHAR = 2;
const FILE_TYPE_PIPE = 3;
const FILE_TYPE_REMOTE = 0x8000;
const PROCESS_BASIC_INFORMATION_CLASS = 0;
const PEB_PROCESS_PARAMETERS_OFFSET_64 = 0x20;
const PEB_PROCESS_PARAMETERS_OFFSET_32 = 0x10;
const COMMAND_LINE_OFFSET_64 = 0x70;
const COMMAND_LINE_OFFSET_32 = 0x40;
const UNICODE_STRING_SIZE_64 = 16;
const UNICODE_STRING_SIZE_32 = 8;
const IMAGE_PATH_CHARACTERS = 32767;
const MAX_COMMAND_LINE_BYTES = 65536;

interface ProcessBasicInformationResult {
	ExitStatus: number;
	PebBaseAddress: unknown;
	AffinityMask: number | bigint;
	BasePriority: number;
	UniqueProcessId: number | bigint;
	InheritedFromUniqueProcessId: number | bigint;
}

interface WindowsApi {
	readonly processInfoOf: (pid: number) => ProcessInfo | undefined;
	readonly commandLineOf: (pid: number) => string | undefined;
	readonly stdoutSinkOf: () => StdoutSink;
}

type OpenProcessFn = (access: number, inherit: boolean, pid: number) => unknown;
type CloseHandleFn = (handle: unknown) => boolean;
type QueryFullProcessImageNameWFn = (handle: unknown, flags: number, pathBuffer: Buffer, size: [number]) => boolean;
type NtQueryInformationProcessFn = (
	handle: unknown,
	informationClass: number,
	information: ProcessBasicInformationResult,
	length: number,
	returnLength: [number],
) => number;
type ReadProcessMemoryFn = (
	handle: unknown,
	baseAddress: unknown,
	output: Buffer,
	size: number,
	bytesRead: [number | bigint],
) => boolean;
type GetStdHandleFn = (stdHandle: number) => unknown;
type GetFileTypeFn = (handle: unknown) => number;
type GetNamedPipeServerProcessIdFn = (pipe: unknown, serverPid: [number]) => boolean;
type GetFinalPathNameByHandleWFn = (handle: unknown, pathBuffer: Buffer, characters: number, flags: number) => number;

const isPid = (pid: number): boolean => Number.isInteger(pid) && pid > 0;

const numberOf = (value: unknown): number | undefined => {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "bigint") {
		const converted = Number(value);

		return Number.isFinite(converted) ? converted : undefined;
	}

	return undefined;
};

const imageNameOf = (imagePath: string): string => {
	const slash = Math.max(imagePath.lastIndexOf("\\"), imagePath.lastIndexOf("/"));
	const basename = slash >= 0 ? imagePath.slice(slash + 1) : imagePath;
	const dot = basename.lastIndexOf(".");

	return (dot > 0 ? basename.slice(0, dot) : basename).toLowerCase();
};

const pathWithoutDevicePrefix = (path: string): string => {
	if (path.startsWith("\\\\?\\UNC\\")) {
		return `\\\\${path.slice(8)}`;
	}

	if (path.startsWith("\\\\?\\")) {
		return path.slice(4);
	}

	return path;
};

const is64Bit = process.arch !== "ia32";

const loadWindowsApi = (): WindowsApi => {
	const koffi = createRequire(import.meta.url)("koffi") as typeof koffiModule;
	const kernel32 = koffi.load("kernel32.dll");
	const ntdll = koffi.load("ntdll.dll");

	koffi.pointer("HANDLE", koffi.opaque());
	koffi.alias("DWORD", "uint32_t");
	koffi.alias("ULONG", "uint32_t");
	koffi.alias("NTSTATUS", "long");
	koffi.alias("SIZE_T", "size_t");
	koffi.alias("WCHAR", "char16_t");

	const processBasicInformation = koffi.struct("PROCESS_BASIC_INFORMATION", {
		ExitStatus: "NTSTATUS",
		PebBaseAddress: "void *",
		AffinityMask: "uintptr",
		BasePriority: "long",
		UniqueProcessId: "uintptr",
		InheritedFromUniqueProcessId: "uintptr",
	});

	const OpenProcess = kernel32.func(
		"HANDLE __stdcall OpenProcess(DWORD dwDesiredAccess, bool bInheritHandle, DWORD dwProcessId)",
	) as OpenProcessFn;
	const CloseHandle = kernel32.func("bool __stdcall CloseHandle(HANDLE hObject)") as CloseHandleFn;
	const QueryFullProcessImageNameW = kernel32.func(
		"bool __stdcall QueryFullProcessImageNameW(HANDLE hProcess, DWORD dwFlags, _Out_ WCHAR *lpExeName, _Inout_ DWORD *lpdwSize)",
	) as QueryFullProcessImageNameWFn;
	const NtQueryInformationProcess = ntdll.func(
		"NTSTATUS __stdcall NtQueryInformationProcess(HANDLE ProcessHandle, int32 ProcessInformationClass, _Out_ PROCESS_BASIC_INFORMATION *ProcessInformation, ULONG ProcessInformationLength, _Out_ ULONG *ReturnLength)",
	) as NtQueryInformationProcessFn;
	const ReadProcessMemory = kernel32.func(
		"bool __stdcall ReadProcessMemory(HANDLE hProcess, const void *lpBaseAddress, _Out_ void *lpBuffer, SIZE_T nSize, _Out_ SIZE_T *lpNumberOfBytesRead)",
	) as ReadProcessMemoryFn;
	const GetStdHandle = kernel32.func("HANDLE __stdcall GetStdHandle(int32 nStdHandle)") as GetStdHandleFn;
	const GetFileType = kernel32.func("DWORD __stdcall GetFileType(HANDLE hFile)") as GetFileTypeFn;
	const GetNamedPipeServerProcessId = kernel32.func(
		"bool __stdcall GetNamedPipeServerProcessId(HANDLE Pipe, _Out_ DWORD *ServerProcessId)",
	) as GetNamedPipeServerProcessIdFn;
	const GetFinalPathNameByHandleW = kernel32.func(
		"DWORD __stdcall GetFinalPathNameByHandleW(HANDLE hFile, _Out_ WCHAR *lpszFilePath, DWORD cchFilePath, DWORD dwFlags)",
	) as GetFinalPathNameByHandleWFn;

	const pathBuffer = Buffer.alloc(IMAGE_PATH_CHARACTERS * 2);

	const openProcessOf = (pid: number): unknown => {
		const withRead = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, false, pid);

		if (withRead) {
			return withRead;
		}

		return OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
	};

	const imagePathOf = (handle: unknown): string | undefined => {
		const size: [number] = [IMAGE_PATH_CHARACTERS];

		if (!QueryFullProcessImageNameW(handle, 0, pathBuffer, size)) {
			return undefined;
		}

		const characterCount = size[0];

		if (characterCount <= 0) {
			return undefined;
		}

		return pathBuffer.toString("utf16le", 0, characterCount * 2);
	};

	const basicInformationOf = (handle: unknown): { ppid: number | undefined; peb: unknown } => {
		const information: ProcessBasicInformationResult = {
			ExitStatus: 0,
			PebBaseAddress: null,
			AffinityMask: 0,
			BasePriority: 0,
			UniqueProcessId: 0,
			InheritedFromUniqueProcessId: 0,
		};
		const returnLength: [number] = [0];
		const status = NtQueryInformationProcess(
			handle,
			PROCESS_BASIC_INFORMATION_CLASS,
			information,
			koffi.sizeof(processBasicInformation),
			returnLength,
		);

		if (status !== 0) {
			return { ppid: undefined, peb: undefined };
		}

		return {
			ppid: numberOf(information.InheritedFromUniqueProcessId),
			peb: information.PebBaseAddress,
		};
	};

	const commandLineOfPeb = (handle: unknown, peb: unknown): string | undefined => {
		if (peb === null || peb === undefined) {
			return undefined;
		}

		const parametersOffset = is64Bit ? PEB_PROCESS_PARAMETERS_OFFSET_64 : PEB_PROCESS_PARAMETERS_OFFSET_32;
		const commandLineOffset = is64Bit ? COMMAND_LINE_OFFSET_64 : COMMAND_LINE_OFFSET_32;
		const unicodeSize = is64Bit ? UNICODE_STRING_SIZE_64 : UNICODE_STRING_SIZE_32;
		const pointerSize = is64Bit ? 8 : 4;
		const pebSlice = Buffer.alloc(parametersOffset + pointerSize);
		const pebBytesRead: [number | bigint] = [0];

		if (!ReadProcessMemory(handle, peb, pebSlice, pebSlice.length, pebBytesRead)) {
			return undefined;
		}

		const processParameters = is64Bit
			? pebSlice.readBigUInt64LE(parametersOffset)
			: BigInt(pebSlice.readUInt32LE(parametersOffset));

		if (processParameters === 0n) {
			return undefined;
		}

		const unicodeBuffer = Buffer.alloc(unicodeSize);
		const unicodeBytesRead: [number | bigint] = [0];
		const commandLineAddress = processParameters + BigInt(commandLineOffset);

		if (!ReadProcessMemory(handle, commandLineAddress, unicodeBuffer, unicodeSize, unicodeBytesRead)) {
			return undefined;
		}

		const byteLength = unicodeBuffer.readUInt16LE(0);
		const stringAddress = is64Bit ? unicodeBuffer.readBigUInt64LE(8) : BigInt(unicodeBuffer.readUInt32LE(4));

		if (byteLength === 0 || stringAddress === 0n || byteLength > MAX_COMMAND_LINE_BYTES) {
			return undefined;
		}

		const commandBuffer = Buffer.alloc(byteLength);
		const commandBytesRead: [number | bigint] = [0];

		if (!ReadProcessMemory(handle, stringAddress, commandBuffer, byteLength, commandBytesRead)) {
			return undefined;
		}

		const commandLine = commandBuffer.toString("utf16le");

		return commandLine.length > 0 ? commandLine : undefined;
	};

	const processInfoOf = (pid: number): ProcessInfo | undefined => {
		if (!isPid(pid)) {
			return undefined;
		}

		const handle = openProcessOf(pid);

		if (!handle) {
			return undefined;
		}

		try {
			const imagePath = imagePathOf(handle);

			if (imagePath === undefined) {
				return undefined;
			}

			return {
				pid,
				ppid: basicInformationOf(handle).ppid,
				name: imageNameOf(imagePath),
			};
		} finally {
			CloseHandle(handle);
		}
	};

	const commandLineOf = (pid: number): string | undefined => {
		if (!isPid(pid)) {
			return undefined;
		}

		const handle = openProcessOf(pid);

		if (!handle) {
			return undefined;
		}

		try {
			return commandLineOfPeb(handle, basicInformationOf(handle).peb);
		} finally {
			CloseHandle(handle);
		}
	};

	const stdoutSinkOf = (): StdoutSink => {
		if (process.stdout.isTTY) {
			return { kind: "tty" };
		}

		const stdoutHandle = GetStdHandle(STD_OUTPUT_HANDLE);

		if (!stdoutHandle) {
			return { kind: "unknown" };
		}

		const fileType = GetFileType(stdoutHandle) & ~FILE_TYPE_REMOTE;

		if (fileType === FILE_TYPE_CHAR) {
			return { kind: "tty" };
		}

		if (fileType === FILE_TYPE_PIPE) {
			const serverPidOut: [number] = [0];
			const resolved = GetNamedPipeServerProcessId(stdoutHandle, serverPidOut);
			const serverPid = resolved ? serverPidOut[0] : undefined;

			return { kind: "stream", serverPid, identity: undefined };
		}

		if (fileType === FILE_TYPE_DISK) {
			const characterCount = GetFinalPathNameByHandleW(stdoutHandle, pathBuffer, IMAGE_PATH_CHARACTERS, 0);

			if (characterCount === 0) {
				return { kind: "unknown" };
			}

			const path = pathWithoutDevicePrefix(pathBuffer.toString("utf16le", 0, characterCount * 2));

			return { kind: "file", path };
		}

		return { kind: "unknown" };
	};

	return { processInfoOf, commandLineOf, stdoutSinkOf };
};

let cachedApi: WindowsApi | undefined;
let loadAttempted = false;

const windowsApiOf = (): WindowsApi | undefined => {
	if (loadAttempted) {
		return cachedApi;
	}

	loadAttempted = true;

	if (process.platform !== "win32") {
		return undefined;
	}

	try {
		cachedApi = loadWindowsApi();
	} catch {
		cachedApi = undefined;
	}

	return cachedApi;
};

export const windowsProvider: Provider = {
	processInfoOf: (pid: number): ProcessInfo | undefined => {
		try {
			return windowsApiOf()?.processInfoOf(pid);
		} catch {
			return undefined;
		}
	},
	commandLineOf: (pid: number): string | undefined => {
		try {
			return windowsApiOf()?.commandLineOf(pid);
		} catch {
			return undefined;
		}
	},
	stdoutSinkOf: (): StdoutSink => {
		try {
			return windowsApiOf()?.stdoutSinkOf() ?? { kind: "unknown" };
		} catch {
			return { kind: "unknown" };
		}
	},
	fd1IdentityOf: (_pid: number): string | undefined => undefined,
};
