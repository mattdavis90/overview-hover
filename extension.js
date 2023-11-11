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
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class PlainExampleExtension extends Extension {
    #injectionManager;

    enable() {
        this.#injectionManager = new InjectionManager();

        this.#patchHover();
    }

    disable() {
        this.#injectionManager.clear();
        this.#injectionManager = null;
    }

    #patchHover() {
        this.#injectionManager.overrideMethod(WindowPreview.prototype, "vfunc_enter_event",
            original => function() {
                let ret = original.apply(this, arguments);

                // This is pretty awful but I couldn't find it exposed any other way
                // I was hoping that either animationInProgress would be set when hiding or
                // that OverviewShownState.HIDING would have been set but neither are true
                // unless the user clicks a preview so we're force to check for gestureInProgress
                const gestureInProgress = Main.overview._overview.controls._stateAdjustment.gestureInProgress;
                if (!Main.overview.animationInProgress && !gestureInProgress) {
                    // Mostly copied from https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/main.js#L822
                    const window = this.metaWindow;
                    const workspaceManager = global.workspace_manager;
                    const activeWorkspaceNum = workspaceManager.get_active_workspace_index();
                    const windowWorkspaceNum = window.get_workspace().index();
                    const time = global.get_current_time();

                    // Don't switch workspace when hovering previews
                    if (windowWorkspaceNum === activeWorkspaceNum) {
                        window.activate(time);
                    }
                }

                return ret;
            }
        );
    }
}
