"""Qt stylesheet implementing the SAR corporate template."""
from ..reporting import style as S

QSS = f"""
QWidget {{ font-family: '{S.FONT}', 'Segoe UI', Arial, sans-serif; font-size: 9pt; color: {S.TEXT}; }}
QMainWindow, #Page {{ background: {S.PAGE_BG}; }}
#Header {{ background: {S.CARD_BG}; border-bottom: 3px solid {S.SAR_BLUE}; }}
#Brand {{ color: {S.SAR_BLUE}; font-size: 22pt; font-weight: 800; letter-spacing: 2px; }}
#Title {{ color: {S.SAR_BLACK}; font-size: 15pt; font-weight: 700; }}
#TitleAccent {{ color: {S.SAR_BLUE}; font-size: 15pt; font-weight: 700; }}
#HeaderInfo {{ color: {S.TEXT_2}; font-size: 8pt; }}
#DataDate {{ background: {S.SAR_BLUE}; color: white; border-radius: 4px; padding: 6px 10px; font-weight: 700; }}
#Nav {{ background: {S.SAR_BLACK}; border: none; color: #E8E8E8; font-size: 9.5pt; outline: 0; }}
#Nav::item {{ padding: 8px 12px; border-left: 3px solid transparent; }}
#Nav::item:selected {{ background: #2B2825; border-left: 3px solid {S.SAR_BLUE}; color: white; font-weight: 700; }}
#Nav::item:hover {{ background: #4A4642; }}
#FilterBar {{ background: {S.CARD_BG}; border-bottom: 1px solid {S.BORDER}; }}
#FilterBar QLabel {{ color: {S.TEXT_2}; font-size: 8pt; }}
QComboBox, QLineEdit, QSpinBox, QDoubleSpinBox, QDateEdit {{ background: white; border: 1px solid {S.BORDER};
    border-radius: 3px; padding: 3px 6px; min-height: 18px; }}
QComboBox:focus, QLineEdit:focus {{ border: 1px solid {S.SAR_BLUE}; }}
#Card {{ background: {S.CARD_BG}; border: 1px solid {S.BORDER}; border-radius: 6px; }}
#Card:hover {{ border: 1px solid {S.SAR_BLUE}; }}
#CardTitle {{ font-size: 10.5pt; font-weight: 700; color: {S.SAR_BLACK}; }}
#CardValue {{ font-size: 24pt; font-weight: 800; }}
#CardSub {{ color: {S.TEXT_2}; font-size: 8pt; }}
#Panel {{ background: {S.CARD_BG}; border: 1px solid {S.BORDER}; border-radius: 6px; }}
#PanelTitle {{ background: {S.SAR_BLUE}; color: white; font-weight: 700; font-size: 10pt; padding: 6px 10px;
    border-top-left-radius: 6px; border-top-right-radius: 6px; }}
#PageTitle {{ font-size: 16pt; font-weight: 800; color: {S.SAR_BLACK}; }}
#Hint {{ color: {S.TEXT_2}; }}
#Warn {{ color: #8a5a00; background: #FFF4D6; border: 1px solid #F0D48A; border-radius: 4px; padding: 6px; }}
#Na {{ color: {S.TEXT_MUTED}; font-size: 11pt; font-weight: 700; }}
QPushButton {{ background: white; border: 1px solid {S.BORDER}; border-radius: 4px; padding: 5px 12px; }}
QPushButton:hover {{ border-color: {S.SAR_BLUE}; color: {S.SAR_BLUE}; }}
QPushButton#Primary {{ background: {S.SAR_BLUE}; color: white; border: none; font-weight: 700; }}
QPushButton#Primary:hover {{ background: {S.SAR_BLUE_DARK}; color: white; }}
QHeaderView::section {{ background: #E9EEF1; color: {S.SAR_BLACK}; font-weight: 700; border: none;
    border-right: 1px solid {S.BORDER}; border-bottom: 1px solid {S.BORDER}; padding: 4px; }}
QTableView, QTreeView, QTreeWidget, QTableWidget {{ background: white; alternate-background-color: #F6F8F9;
    gridline-color: #EEF0F2; border: 1px solid {S.BORDER}; selection-background-color: #CFE6EA; selection-color: {S.TEXT}; }}
QTabWidget::pane {{ border: 1px solid {S.BORDER}; background: white; }}
QTabBar::tab {{ background: #E9EEF1; padding: 6px 14px; border: 1px solid {S.BORDER}; border-bottom: none; }}
QTabBar::tab:selected {{ background: white; color: {S.SAR_BLUE}; font-weight: 700; }}
QProgressBar {{ border: 1px solid {S.BORDER}; border-radius: 3px; text-align: center; background: white; }}
QProgressBar::chunk {{ background: {S.SAR_BLUE}; }}
QStatusBar {{ background: {S.CARD_BG}; color: {S.TEXT_2}; }}
QScrollArea {{ border: none; background: transparent; }}
QToolTip {{ background: {S.SAR_BLACK}; color: white; border: none; padding: 4px; }}
"""
