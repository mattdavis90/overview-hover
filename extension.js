/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */
import { Extension, InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';
import { WindowPreview } from 'resource:///org/gnome/shell/ui/windowPreview.js';
import { ControlsManager } from 'resource:///org/gnome/shell/ui/overviewControls.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DEBUGGING = false;

export default class OverviewHoverExtension extends Extension {
    #injectionManager;
    // The window to switch to
    #window;
    #windowId;
    // Used to hold a window until the mouse moves
    #tmpWindow;
    #tmpWindowId;
    // Location of the mouse when a gesture starts
    #pointerAtBegin;
    // Is a gesture in progress
    #gesturing;
    // Interval used to track mouse position
    #mouseInterval;

    enable() {
        this.#injectionManager = new InjectionManager();

        this.#window = null;
        this.#windowId = null;
        this.#tmpWindow = null;
        this.#tmpWindowId = null;
        this.#pointerAtBegin = null;
        this.#gesturing = false;
        this.#mouseInterval = null;
        this.#patchHover();

        if (DEBUGGING) {
            this.#addLog(WindowPreview.prototype, "WindowPreview", "showOverlay");
            this.#addLog(WindowPreview.prototype, "WindowPreview", "hideOverlay");
            // this.#addLog(WindowPreview.prototype, "WindowPreview", "vfunc_enter_event");
            // this.#addLog(WindowPreview.prototype, "WindowPreview", "vfunc_leave_event");
            // this.#addLog(ControlsManager.prototype, "ControlManager", "prepareToLeaveOverview");
            this.#addLog(ControlsManager.prototype, "ControlManager", "animateFromOverview");
            // this.#addLog(ControlsManager.prototype, "ControlManager", "gestureBegin");
            // this.#addLog(ControlsManager.prototype, "ControlManager", "gestureEnd");
        }
    }

    disable() {
        this.#injectionManager.clear();
        this.#injectionManager = null;
        this.#stopMouseTracking();
    }

    #debugLog(msg) {
        if (DEBUGGING) {
            console.log(msg);
        }
    }

    #addLog(cls, clsName, func) {
        this.#injectionManager.overrideMethod(cls, func,
            (original) => {
                const self = this;
                return function() {
                    self.#debugLog(`Before ${clsName}:${func}`);
                    const ret = original.apply(this, arguments);
                    self.#debugLog(`After ${clsName}:${func} - ${ret}`);
                    return ret;
                }
            }
        );
    }

    #patchHover() {
        this.#injectionManager.overrideMethod(WindowPreview.prototype, "vfunc_enter_event",
            (original) => {
                const self = this;
                return function() {
                    self.#debugLog(`Show overlay on preview - ${this._getCaption()}`);
                    if (self.#shouldUpdate()) {
                        self.#debugLog(" - Setting active window");
                        self.#window = this.metaWindow;
                        self.#windowId = this.metaWindow.get_id();
                    } else if (!self.#gesturing) {
                        self.#debugLog(" - Setting temp window");
                        self.#tmpWindow = this.metaWindow;
                        self.#tmpWindowId = this.metaWindow.get_id();
                    }

                    return original.apply(this, arguments);
                }
            }
        );
        this.#injectionManager.overrideMethod(WindowPreview.prototype, "vfunc_leave_event",
            (original) => {
                const self = this;
                return function() {
                    self.#debugLog(`Hide overlay on preview - ${this._getCaption()}`);
                    const windowId = this.metaWindow.get_id();
                    if (self.#shouldUpdate() && self.#windowId == windowId) {
                        self.#debugLog("- Clearing active window");
                        self.#window = null;
                        self.#windowId = null;
                    }
                    self.#debugLog(" - Clearing pointer position");
                    self.#pointerAtBegin = null;
                    self.#stopMouseTracking();

                    return original.apply(this, arguments);
                }
            }
        );
        this.#injectionManager.overrideMethod(ControlsManager.prototype, "prepareToLeaveOverview",
            (original) => {
                const self = this;
                return function() {
                    self.#debugLog("Leaving overview");
                    self.#changeWindow();
                    self.#stopMouseTracking();
                    return original.apply(this, arguments);
                }
            }
        );
        this.#injectionManager.overrideMethod(ControlsManager.prototype, "gestureBegin",
            (original) => {
                const self = this;
                return function() {
                    self.#gesturing = true;
                    if (Main.overview.visible) {
                        self.#debugLog("Start of gesture from overview");
                        self.#debugLog(" - Changing active window");
                        self.#changeWindow();
                    } else {
                        self.#debugLog("Start of gesture to overview");
                        self.#debugLog(" - Setting pointer position");
                        self.#pointerAtBegin = global.get_pointer();
                        self.#debugLog(" - Starting mouse tracker");
                        self.#mouseInterval = setInterval(() => {
                            if (self.#hasPointerMoved()) {
                                self.#debugLog("Mouse moved, stopping tracking");
                                self.#stopMouseTracking();
                            }
                        }, 100);
                    }

                    return original.apply(this, arguments);
                }
            }
        );
        this.#injectionManager.overrideMethod(ControlsManager.prototype, "gestureEnd",
            (original) => {
                const self = this;
                return function() {
                    self.#debugLog("End of gesture");
                    self.#gesturing = false;
                    if (!Main.overview.visible) {
                        self.#stopMouseTracking();
                    }

                    return original.apply(this, arguments);
                }
            }
        );
    }

    #hasPointerMoved() {
        this.#debugLog("Checking mouse position");
        const [currX, currY] = global.get_pointer();
        const [x, y] = this.#pointerAtBegin || [null, null];
        return currX != x || currY != y;
    }

    #stopMouseTracking() {
        this.#debugLog("Stopping mouse tracking");
        if (this.#mouseInterval !== null) {
            clearInterval(this.#mouseInterval);
        }
        this.#pointerAtBegin = null;
        this.#window = this.#tmpWindow;
        this.#windowId = this.#tmpWindowId;
        this.#tmpWindow = null;
        this.#tmpWindowId = null;
    }

    #shouldUpdate() {
        return !this.#gesturing && this.#hasPointerMoved();
    }

    #changeWindow() {
        this.#debugLog("Change window called");
        if (this.#window !== null) {
            this.#debugLog(" - window !== null - changing");
            // Mostly copied from https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/main.js#L835
            const window = this.#window;
            const workspaceManager = global.workspace_manager;
            const activeWorkspaceNum = workspaceManager.get_active_workspace_index();
            const windowWorkspaceNum = window.get_workspace().index();
            const time = global.get_current_time();

            // Don't switch workspace when hovering previews
            if (windowWorkspaceNum === activeWorkspaceNum) {
                window.activate(time);
            }
        }
        this.#window = null;
        this.#windowId = null;
        this.#tmpWindow = null;
        this.#tmpWindowId = null;
    }
}
