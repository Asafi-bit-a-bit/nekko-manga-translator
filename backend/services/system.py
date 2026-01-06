"""
System information service.
"""
import platform
import subprocess


def get_cpu_name() -> str:
    """Get CPU name."""
    if platform.system() == "Darwin":
        try:
            return (
                subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"])
                .decode()
                .strip()
            )
        except Exception:
            pass
    return platform.processor() or platform.machine() or "Unknown CPU"

